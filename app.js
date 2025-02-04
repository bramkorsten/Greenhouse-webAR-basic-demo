/*
 * Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const MODEL_OBJ_URL = "../assets/ArcticFox_Posed.obj";
const MODEL_MTL_URL = "../assets/ArcticFox_Posed.mtl";
const GH_OBJ_URL = "../assets/model8/GH_logo_baked.obj";
const GH_MTL_URL = "../assets/model8/GH_logo_baked.mtl";
const MODEL_SCALE = 0.005;

var model;
var animationClip;
var mixer;
var clips;
var animationAction;
var clock = new THREE.Clock();

/**
 * Container class to manage connecting to the WebXR Device API
 * and handle rendering on every frame.
 */
class App {
  constructor() {
    var polyfill = new WebXRPolyfill();
    this.onXRFrame = this.onXRFrame.bind(this);
    this.onEnterAR = this.onEnterAR.bind(this);
    this.onClick = this.onClick.bind(this);

    this.init();
  }

  /**
   * Fetches the XRDevice, if available.
   */
  async init() {
    // The entry point of the WebXR Device API is on `navigator.xr`.
    // We also want to ensure that `XRSession` has `requestHitTest`,
    // indicating that the #webxr-hit-test flag is enabled.
    if (navigator.xr && XRSession.prototype.requestHitTest) {
      try {
        this.device = await navigator.xr.requestDevice();
      } catch (e) {
        // If there are no valid XRDevice's on the system,
        // `requestDevice()` rejects the promise. Catch our
        // awaited promise and display message indicating there
        // are no valid devices.
        this.onNoXRDevice();
        return;
      }
    } else {
      // If `navigator.xr` or `XRSession.prototype.requestHitTest`
      // does not exist, we must display a message indicating there
      // are no valid devices.
      this.onNoXRDevice();
      return;
    }

    // We found an XRDevice! Bind a click listener on our "Enter AR" button
    // since the spec requires calling `device.requestSession()` within a
    // user gesture.
    document
      .querySelector("#enter-ar")
      .addEventListener("click", this.onEnterAR);
  }

  /**
   * Handle a click event on the '#enter-ar' button and attempt to
   * start an XRSession.
   */
  async onEnterAR() {
    // Now that we have an XRDevice, and are responding to a user
    // gesture, we must create an XRPresentationContext on a
    // canvas element.
    const outputCanvas = document.createElement("canvas");
    const ctx = outputCanvas.getContext("xrpresent");
    this.ctxgl2 = outputCanvas.getContext("webgl2");

    try {
      // Request a session for the XRDevice with the XRPresentationContext
      // we just created.
      // Note that `device.requestSession()` must be called in response to
      // a user gesture, hence this function being a click handler.
      const session = await this.device.requestSession({
        outputContext: ctx,
        environmentIntegration: true
      });

      // If `requestSession` is successful, add the canvas to the
      // DOM since we know it will now be used.
      document.body.appendChild(outputCanvas);
      this.onSessionStarted(session);
    } catch (e) {
      // If `requestSession` fails, the canvas is not added, and we
      // call our function for unsupported browsers.
      this.onNoXRDevice();
    }
  }

  /**
   * Toggle on a class on the page to disable the "Enter AR"
   * button and display the unsupported browser message.
   */
  onNoXRDevice() {
    document.body.classList.add("unsupported");
  }

  /**
   * Called when the XRSession has begun. Here we set up our three.js
   * renderer, scene, and camera and attach our XRWebGLLayer to the
   * XRSession and kick off the render loop.
   */
  async onSessionStarted(session) {
    this.session = session;

    // Add the `ar` class to our body, which will hide our 2D components
    document.body.classList.add("ar");

    // To help with working with 3D on the web, we'll use three.js. Set up
    // the WebGLRenderer, which handles rendering to our session's base layer.
    this.renderer = new THREE.WebGLRenderer(this.ctxgl2, {
      alpha: true,
      preserveDrawingBuffer: true
    });
    this.renderer.autoClear = false;
    // this.renderer.gammaOutput = true;
    // this.renderer.gammaFactor = 2.2;

    // We must tell the renderer that it needs to render shadows.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.gl = this.renderer.getContext();

    // Ensure that the context we want to write to is compatible
    // with our XRDevice
    await this.gl.setCompatibleXRDevice(this.session.device);

    // Set our session's baseLayer to an XRWebGLLayer
    // using our new renderer's context
    this.session.baseLayer = new XRWebGLLayer(this.session, this.gl);

    // Set the XRSession framebuffer on our three.js renderer rather
    // than using the default framebuffer -- this is necessary for things
    // in three.js that use other render targets, like shadows.
    const framebuffer = this.session.baseLayer.framebuffer;
    this.renderer.setFramebuffer(framebuffer);

    // A THREE.Scene contains the scene graph for all objects in the
    // render scene. Call our utility which gives us a THREE.Scene
    // with a few lights and surface to render our shadows. Lights need
    // to be configured in order to use shadows, see `shared/utils.js`
    // for more information.
    this.scene = DemoUtils.createUnlitScene();

    // Use the DemoUtils.loadModel to load our OBJ and MTL. The promise
    // resolves to a THREE.Group containing our mesh information.
    // Dont await this promise, as we want to start the rendering
    // process before this finishes.
    //
    DemoUtils.loadModel(GH_OBJ_URL, GH_MTL_URL).then(modelImport => {
      //JOWJOW
      model = modelImport;
      var texture = new THREE.TextureLoader().load(
        "../assets/model8/GH_logo_dif.jpg"
      );
      var a_texture = new THREE.TextureLoader().load(
        "../assets/model8/A_GH_logo_dif.jpg"
      );
      var material = new THREE.MeshBasicMaterial({ map: texture });
      var shadowMaterial = new THREE.MeshBasicMaterial({
        alphaMap: a_texture,
        color: new THREE.Color(0x000000),
        transparent: true
      });
      // Some models contain multiple meshes, so we want to make sure
      // all of our meshes within the model case a shadow.
      model.children.forEach(
        function(obj) {
          if (obj.name == "GH_solid") {
            obj.material = material;
          }
          if (obj.name == "Plane") {
            obj.material = shadowMaterial;
          }

          obj.castShadow = false;
          obj.receiveShadow = false;
          // console.log(obj);
          // console.log("enne");
        }
        // mesh =>
        //   function() {
        //     console.log("goan");
        //     mesh.castShadow = true;
        //     mesh.material = material;
        //   }
      );

      // Every model is different -- you may have to adjust the scale
      // of a model depending on the use.
      model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
    });

    var loader = new THREE.GLTFLoader().setPath("../assets/model9/");
    loader.load("gh_logo.gltf", function(gltf) {
      model = gltf.scene;
      mixer = new THREE.AnimationMixer(gltf.scene);
      clips = gltf.animations;
      // animationClip = THREE.AnimationClip.findByName(
      //   clips,
      //   "inner_dot_animation_01"
      // );
      // console.log(animationClip);
      // animationAction = mixer.clipAction(animationClip);
      // animationAction.play();

      var texture = new THREE.TextureLoader().load(
        "../assets/model8/GH_logo_dif.jpg"
      );
      texture.flipY = false;
      // texture.encoding = THREE.linearEncoding;
      var a_texture = new THREE.TextureLoader().load(
        "../assets/model8/A_GH_logo_dif.jpg"
      );
      a_texture.flipY = false;
      a_texture.encoding = THREE.linearEncoding;
      var material = new THREE.MeshBasicMaterial({ map: texture });
      var shadowMaterial = new THREE.MeshBasicMaterial({
        alphaMap: a_texture,
        color: new THREE.Color(0x000000),
        transparent: true
      });
      // Some models contain multiple meshes, so we want to make sure
      // all of our meshes within the model case a shadow.
      model.children.forEach(function(obj) {
        if (
          obj.name == "GH_outer_ring" ||
          obj.name == "GH_inner_ring" ||
          obj.name == "GH_inner_dot"
        ) {
          obj.material = material;
        }
        if (obj.name == "Plane") {
          obj.material = shadowMaterial;
        }

        obj.castShadow = false;
        obj.receiveShadow = false;
        // console.log(obj);
        // console.log("enne");
      });
      // model.children.forEach(mesh => (mesh.castShadow = true));
      model.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
    });

    // We'll update the camera matrices directly from API, so
    // disable matrix auto updates so three.js doesn't attempt
    // to handle the matrices independently.
    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = false;

    // Add a Reticle object, which will help us find surfaces by drawing
    // a ring shape onto found surfaces. See source code
    // of Reticle in shared/utils.js for more details.
    this.reticle = new Reticle(this.session, this.camera);
    this.scene.add(this.reticle);

    this.frameOfRef = await this.session.requestFrameOfReference("eye-level");
    this.session.requestAnimationFrame(this.onXRFrame);
    var animationDirectionForwards = true;
    $("#buttonStart").click(function(e) {
      e.preventDefault();
      if (animationDirectionForwards) {
        window.app.runAnimations(true);
        animationDirectionForwards = false;
      } else {
        window.app.runAnimations(false);
        animationDirectionForwards = true;
      }

      return false;
    });
    window.addEventListener("click", this.onClick);
  }

  /**
   * Called on the XRSession's requestAnimationFrame.
   * Called with the time and XRPresentationFrame.
   */
  onXRFrame(time, frame) {
    let session = frame.session;
    let pose = frame.getDevicePose(this.frameOfRef);

    if (mixer) {
      var dt = clock.getDelta();
      mixer.update(dt);
    }

    // Update the reticle's position
    this.reticle.update(this.frameOfRef);

    // If the reticle has found a hit (is visible) and we have
    // not yet marked our app as stabilized, do so
    if (this.reticle.visible && !this.stabilized) {
      this.stabilized = true;
      document.body.classList.add("stabilized");
    }

    // Queue up the next frame
    session.requestAnimationFrame(this.onXRFrame);

    // Bind the framebuffer to our baseLayer's framebuffer
    this.gl.bindFramebuffer(
      this.gl.FRAMEBUFFER,
      this.session.baseLayer.framebuffer
    );

    if (pose) {
      // Our XRFrame has an array of views. In the VR case, we'll have
      // two views, one for each eye. In mobile AR, however, we only
      // have one view.
      for (let view of frame.views) {
        const viewport = session.baseLayer.getViewport(view);
        this.renderer.setSize(viewport.width, viewport.height);

        // Set the view matrix and projection matrix from XRDevicePose
        // and XRView onto our THREE.Camera.
        this.camera.projectionMatrix.fromArray(view.projectionMatrix);
        const viewMatrix = new THREE.Matrix4().fromArray(
          pose.getViewMatrix(view)
        );
        this.camera.matrix.getInverse(viewMatrix);
        this.camera.updateMatrixWorld(true);

        // Render our scene with our THREE.WebGLRenderer
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  /**
   * This method is called when tapping on the page once an XRSession
   * has started. We're going to be firing a ray from the center of
   * the screen, and if a hit is found, use it to place our object
   * at the point of collision.
   */
  async onClick(e) {
    // If our model is not yet loaded, abort
    if (!model) {
      return;
    }

    // We're going to be firing a ray from the center of the screen.
    // The requestHitTest function takes an x and y coordinate in
    // Normalized Device Coordinates, where the upper left is (-1, 1)
    // and the bottom right is (1, -1). This makes (0, 0) our center.
    const x = 0;
    const y = 0;

    // Create a THREE.Raycaster if one doesn't already exist,
    // and use it to generate an origin and direction from
    // our camera (device) using the tap coordinates.
    // Learn more about THREE.Raycaster:
    // https://threejs.org/docs/#api/core/Raycaster
    this.raycaster = this.raycaster || new THREE.Raycaster();
    this.raycaster.setFromCamera({ x, y }, this.camera);
    const ray = this.raycaster.ray;

    // Fire the hit test to see if our ray collides with a real
    // surface. Note that we must turn our THREE.Vector3 origin and
    // direction into an array of x, y, and z values. The proposal
    // for `XRSession.prototype.requestHitTest` can be found here:
    // https://github.com/immersive-web/hit-test
    const origin = new Float32Array(ray.origin.toArray());
    const direction = new Float32Array(ray.direction.toArray());
    const hits = await this.session.requestHitTest(
      origin,
      direction,
      this.frameOfRef
    );

    // If we found at least one hit...
    if (hits.length) {
      // We can have multiple collisions per hit test. Let's just take the
      // first hit, the nearest, for now.
      const hit = hits[0];

      // Our XRHitResult object has one property, `hitMatrix`, a
      // Float32Array(16) representing a 4x4 Matrix encoding position where
      // the ray hit an object, and the orientation has a Y-axis that corresponds
      // with the normal of the object at that location.
      // Turn this matrix into a THREE.Matrix4().
      const hitMatrix = new THREE.Matrix4().fromArray(hit.hitMatrix);

      // Now apply the position from the hitMatrix onto our model.
      model.position.setFromMatrixPosition(hitMatrix);

      // Rather than using the rotation encoded by the `modelMatrix`,
      // rotate the model to face the camera. Use this utility to
      // rotate the model only on the Y axis.
      DemoUtils.lookAtOnY(model, this.camera);
      // model.rotation.x = THREE.Math.degToRad(90);

      // Now that we've found a collision from the hit test, let's use
      // the Y position of that hit and assume that's the floor. We created
      // a mesh in `DemoUtils.createLitScene()` that receives shadows, so set
      // it's Y position to that of the hit matrix so that shadows appear to be
      // cast on the ground under the model.
      // const shadowMesh = this.scene.children.find(c => c.name === "shadowMesh");
      // shadowMesh.position.y = model.position.y;

      // Ensure our model has been added to the scene.
      this.scene.add(model);
    }
  }

  runAnimations(forwards) {
    console.log("running animations", forwards);
    clips.forEach(function(clip) {
      const animation = mixer.clipAction(clip);
      // animation.reset();
      animation.paused = false;
      animation.setLoop(THREE.LoopOnce);
      animation.clampWhenFinished = true;
      if (forwards) {
        animation.timeScale = 1;
      } else {
        animation.timeScale = -1;
      }
      animation.play();
    });
  }
}

window.app = new App();
