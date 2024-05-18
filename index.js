/*
 *
 * This file sets up our web app with 3D scene and communications.
 *
 */

import * as THREE from "three";
import { Communications } from "./communications.js";
import { FirstPersonControls } from "./libs/firstPersonControls.js";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';

// lerp value to be used when interpolating positions and rotations
let lerpValue = 0;
let terrainMesh;
let camera, renderer, scene, sky, sun;
let controls;
let listener;
let communications;

let frameCount = 0;
let peers = {};
let modelCenter = new THREE.Vector3();
let cameraPathPosition = 0;
let cameraPath;
let raycaster = new THREE.Raycaster();
let playerHeight = 1.8; // Height from the ground at which the camera should be maintained
let physicsWorld;
// const groundMeshes = [yourTerrainMesh]; // Define this array based on your actual terrain objects
// const intersects = raycaster.intersectObjects(groundMeshes, true);
import * as CANNON from 'https://unpkg.com/cannon-es@0.19.0/dist/cannon-es.js'


// Start playing the audio when the scene loads

function init() {
  scene = new THREE.Scene();
  // Create an AudioContext instance
const audioContext = new AudioContext();

  
  
// Load the audio file
fetch('https://cdn.glitch.global/bda6b2d7-0ec0-48db-b904-c8d78c4140d9/TrackTribe%20-%20Walk%20Through%20the%20Park%20(aka%20the%20HEADPHONE%20COMPARISON%20song).mp3?v=1715020283789')
  .then(response => response.arrayBuffer())
  .then(buffer => audioContext.decodeAudioData(buffer))
  .then(audioBuffer => {
    // Create a buffer source node
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Connect the source to the destination (e.g., speakers)
    source.connect(audioContext.destination);

    // Play the audio
    source.start();
  })
  .catch(error => console.error('Error loading audio file:', error));

// const terrain = createTerrain();
  
  //---------------------physic world-------------------------
initPhysics(); 
loadModel();
setupSky();
 
  
function initPhysics() {
    physicsWorld = new CANNON.World();
    physicsWorld.gravity.set(0, -9.82, 0); // Gravity pulls down
    physicsWorld.broadphase = new CANNON.NaiveBroadphase();
    physicsWorld.solver.iterations = 10;
  
  
  
}


  
  let defaultMaterial = new CANNON.Material('default');

let defaultContactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
    friction: 0.1,
    restitution: 0.7,
});
physicsWorld.addContactMaterial(defaultContactMaterial);
physicsWorld.defaultContactMaterial = defaultContactMaterial;

  //-------------------------------------------------------
 
 
  communications = new Communications();

  communications.on("peerJoined", (id) => {
    addPeer(id);
  });
  communications.on("peerLeft", (id) => {
    removePeer(id);
  });
  communications.on("positions", (positions) => {
    updatePeerPositions(positions);
  });

  // it may take a few seconds for this communications class to be initialized
  setTimeout(() => {
    communications.sendData("hello");
  }, 2000);
  communications.on("data", (msg) => {
    console.log("Received message:", msg);
    if (msg.type == "box") {
      onNewBox(msg);
    }
  });

  let width = window.innerWidth;
  let height = window.innerHeight * 0.9;

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 50);
  camera.position.set(0, 3, 6);
  scene.add(camera);

  // create an AudioListener and add it to the camera
  listener = new THREE.AudioListener();
  camera.add(listener);

  //THREE WebGL renderer
  renderer = new THREE.WebGLRenderer({
    antialiasing: true,
  });
  renderer.setClearColor(new THREE.Color("lightblue"));
 
  renderer.setSize(width, height);
  document.body.appendChild(renderer.domElement);


  // add controls:
  controls = new FirstPersonControls(scene, camera, renderer, physicsWorld);

  // add controls for adding boxes on a key press
  window.addEventListener("keyup", (ev) => {
    if (ev.key === "b") {
      addBox();
    }
  });

  //Push the canvas to the DOM
  let domElement = document.getElementById("canvas-container");
  domElement.append(renderer.domElement);

  //Setup event listeners for events and handle the states
  window.addEventListener("resize", (e) => onWindowResize(e), false);

  // Helpers
  scene.add(new THREE.GridHelper(500, 500));
  scene.add(new THREE.AxesHelper(10));

  addLights();

  // Start the loop
  update();
 
}

function loadModel() {
    const loader = new GLTFLoader();
    loader.load(
        'https://cdn.glitch.me/bda6b2d7-0ec0-48db-b904-c8d78c4140d9/Villa%20landscape%205-5-2024%20_12.glb?v=1715020855042',
        function (gltf) {
            const scaleFactor = 4;
            const yOffset = -1;
            const xOffset = 8;

            gltf.scene.scale.set(scaleFactor, scaleFactor, scaleFactor);
            gltf.scene.position.set(xOffset, yOffset, 0);

            // Create bounding box
            const boundingBox = new THREE.Box3().setFromObject(gltf.scene);

            // Add collidable mesh for physics
            const shape = new CANNON.Box(
                new CANNON.Vec3(
                    (boundingBox.max.x - boundingBox.min.x) / 2,
                    (boundingBox.max.y - boundingBox.min.y) / 2,
                    (boundingBox.max.z - boundingBox.min.z) / 2
                )
            );
            const body = new CANNON.Body({
                mass: 0, // static
                position: new CANNON.Vec3().copy(boundingBox.getCenter(new THREE.Vector3())),
                shape: shape,
            });
            physicsWorld.addBody(body);

            scene.add(gltf.scene);

            console.log("Model loaded and meshes marked as collidable");

            // Adjust camera and controls
            const center = new THREE.Vector3();
            boundingBox.getCenter(center);
            camera.lookAt(center);
            if (controls && controls.target) {
                controls.target.copy(center);
            }

            updateSky();
            render();
        },
        undefined,
        function (error) {
            console.error('An error happened:', error);
        }
    );
}



init();




//////////////////////////////////////////////////////////////////////
// Lighting 💡
//////////////////////////////////////////////////////////////////////

//   const ambientLight = new THREE.AmbientLight(0xEEE48E, 0.3);
//     scene.add(ambientLight);
 
  const directionalLight = new THREE.DirectionalLight(0xFFF6E8, 2);
  directionalLight.position.set(0.5, 1, 0.5).normalize();
  scene.add(directionalLight);

  const hemiLight = new THREE.HemisphereLight(0xffeeb1, 0x080820, 2); // Add soft light from sky
  scene.add(hemiLight);

function addLights() {
  scene.add(new THREE.AmbientLight(0xffffe6, 0.7));
}

//////////////////////////////////////////////////////////////////////
// Clients 👫
//////////////////////////////////////////////////////////////////////

// add a client meshes, a video element and  canvas for three.js video texture
function addPeer(id) {
  let videoElement = document.getElementById(id + "_video");
  let videoTexture = new THREE.VideoTexture(videoElement);

  let videoMaterial = new THREE.MeshBasicMaterial({
    map: videoTexture,
    overdraw: true,
    side: THREE.DoubleSide,
  });
  let otherMat = new THREE.MeshPhongMaterial();

  let head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), [
    otherMat,
    otherMat,
    otherMat,
    otherMat,
    otherMat,
    videoMaterial,
  ]);

  // set position of head before adding to parent object
  head.position.set(0, 0, 0);

  // https://threejs.org/docs/index.html#api/en/objects/Group
  var group = new THREE.Group();
  group.add(head);

  // add group to scene
  scene.add(group);

  peers[id] = {};
  peers[id].group = group;

  peers[id].previousPosition = new THREE.Vector3();
  peers[id].previousRotation = new THREE.Quaternion();
  peers[id].desiredPosition = new THREE.Vector3();
  peers[id].desiredRotation = new THREE.Quaternion();
}

function removePeer(id) {
  scene.remove(peers[id].group);
}

// overloaded function can deal with new info or not
function updatePeerPositions(positions) {
  lerpValue = 0;
  for (let id in positions) {
    if (!peers[id]) continue;
    peers[id].previousPosition.copy(peers[id].group.position);
    peers[id].previousRotation.copy(peers[id].group.quaternion);
    peers[id].desiredPosition = new THREE.Vector3().fromArray(
      positions[id].position
    );
    peers[id].desiredRotation = new THREE.Quaternion().fromArray(
      positions[id].rotation
    );
  }
}

function interpolatePositions() {
  lerpValue += 0.1; // updates are sent roughly every 1/5 second == 10 frames
  for (let id in peers) {
    if (peers[id].group) {
      peers[id].group.position.lerpVectors(
        peers[id].previousPosition,
        peers[id].desiredPosition,
        lerpValue
      );
      peers[id].group.quaternion.slerpQuaternions(
        peers[id].previousRotation,
        peers[id].desiredRotation,
        lerpValue
      );
    }
  }
}

function updatePeerVolumes() {
  for (let id in peers) {
    let audioEl = document.getElementById(id + "_audio");
    if (audioEl && peers[id].group) {
      let distSquared = camera.position.distanceToSquared(
        peers[id].group.position
      );

      if (distSquared > 500) {
        audioEl.volume = 0;
      } else {
        // from lucasio here: https://discourse.threejs.org/t/positionalaudio-setmediastreamsource-with-webrtc-question-not-hearing-any-sound/14301/29
        let volume = Math.min(1, 10 / distSquared);
        audioEl.volume = volume;
      }
    }
  }
}

//////////////////////////////////////////////////////////////////////
// Interaction 🤾‍♀️
//////////////////////////////////////////////////////////////////////

function getPlayerPosition() {
  return [
    [camera.position.x, camera.position.y, camera.position.z],
    [
      camera.quaternion._x,
      camera.quaternion._y,
      camera.quaternion._z,
      camera.quaternion._w,
    ],
  ];
}

//////////////////////////////////////////////////////////////////////
// Rendering 🎥
//////////////////////////////////////////////////////////////////////

function update() {
  requestAnimationFrame(update); // Simplified to use direct reference to the function

  const deltaTime = 1 / 60; // Fixed time step size, assuming 60 FPS

  // Update the physics world with the fixed time step
  if (physicsWorld) {
    physicsWorld.step(deltaTime);
  }

  frameCount++;

  if (frameCount % 25 === 0) {
    updatePeerVolumes();
  }

  if (frameCount % 10 === 0) {
    let position = getPlayerPosition();
    communications.sendPosition(position);
  }

  interpolatePositions();

  controls.update();

  renderer.render(scene, camera);
}

function updatePlayerPositionFromControls(deltaTime) {
    const inputVelocity = new CANNON.Vec3(); // Determine this based on your input controls

    // Simple example of moving forward
    if (controls.moveForward) {
        inputVelocity.z = -5.0 * deltaTime; // Move forward speed * time
    }
    playerBody.velocity.x = inputVelocity.x;
    playerBody.velocity.y = inputVelocity.y;
    playerBody.velocity.z = inputVelocity.z;
}

//////////////////////////////////////////////////////////////////////
// Event Handlers 🍽
//////////////////////////////////////////////////////////////////////

function onWindowResize(e) {
  let width = window.innerWidth;
  let height = Math.floor(window.innerHeight * 0.9);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function addBox() {
  let msg = {
    type: "box",
    data: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
  };
  communications.sendData(msg);
}

function onNewBox(msg) {
  let geo = new THREE.BoxGeometry(1, 1, 1);
  let mat = new THREE.MeshBasicMaterial();
  let mesh = new THREE.Mesh(geo, mat);

  let pos = msg.data;
  mesh.position.set(pos.x, pos.y, pos.z);

  scene.add(mesh);
}



//--------Model---------------


function setupCameraPath() {
    cameraPath = new THREE.CatmullRomCurve3([
       
      new THREE.Vector3(-1, 1.4, -10),    
      new THREE.Vector3(-1, 1.4, -5),
      new THREE.Vector3(0, 2, 5),
      new THREE.Vector3(0, 4, -10),
      new THREE.Vector3(0, 2, -12)
    ]);

    // Visualize the path
    const points = cameraPath.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: "yellow" });
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    document.addEventListener('wheel', function(event) {
        cameraPathPosition += event.deltaY * 0.0001;
        cameraPathPosition = Math.max(0, Math.min(1, cameraPathPosition));
        const pos = cameraPath.getPointAt(cameraPathPosition);
        camera.position.copy(pos);
        camera.lookAt(modelCenter);
        render();
    });
}

function setupSky() {
    sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    // Initialize sun as it's used in the sky calculations
    sun = new THREE.Vector3();

    // Setup the sky parameters and the material should be properly initialized here
    updateSky();
}

//link//
function setupListeners() {
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('mousemove', onMouseMove, false);
}

function onMouseMove(event) {
    const mouse = new THREE.Vector2(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Define a bounding box between two interest points
    const box = new THREE.Box3(
        new THREE.Vector3(-5, -5, -5), // min coordinates
        new THREE.Vector3(0, 0, 20) // max coordinates
    );

    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        const point = intersects[0].point;
        if (box.containsPoint(point)) {
            handleMouseEnterArea();  // Handle the mouse entering the area
        } else {
            handleMouseLeaveArea();  // Handle the mouse leaving the area
        }
    }
}

function handleMouseEnterArea() {
    // Perform actions when the mouse enters the area
    console.log("Mouse is within the designated area");
    // Open the link in a new tab when mouse enters the designated area
    window.open("https://www.taapani.com/landscape-space/samui-villas-landscape", "_blank");
}

function handleMouseLeaveArea() {
    // Perform actions when the mouse leaves the area
    console.log("Mouse left the designated area");
    // Additional actions can be taken here, if necessary
}



function animate() {
    requestAnimationFrame(animate);
    controls.update();
    render();
}

function render() {
    renderer.render(scene, camera);
}

function updateSky() {
    if (!renderer) {
        console.error("Renderer is not initialized");
        return;
    }
    console.log("Sky added to scene:", sky);
    // Ensure tone mapping is set
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;  // Adjust this value as needed

    const effectController = {
        turbidity: 0.8,  // Lower values for clearer sky
        rayleigh: 0.5,   // Controls the blue sky gradient
        mieCoefficient: 0.005,
        mieDirectionalG: 0.7,
        elevation: 2,    // Sun elevation, adjust for time of day
        azimuth: 180,    // Sun position in the sky, adjust as needed
        exposure: renderer.toneMappingExposure
    };

    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = effectController.turbidity;
    uniforms['rayleigh'].value = effectController.rayleigh;
    uniforms['mieCoefficient'].value = effectController.mieCoefficient;
    uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
    const theta = THREE.MathUtils.degToRad(effectController.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);

    uniforms['sunPosition'].value.copy(sun);
    console.log("Sun position:", sun);
    renderer.toneMappingExposure = effectController.exposure;
    render();
}



let playerBody;

function initPlayerPhysics() {
    const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
    playerBody = new CANNON.Body({
        mass: 1,
        position: new CANNON.Vec3(0, 2, 0), // Start position in the world
        shape: playerShape
    });
    physicsWorld.addBody(playerBody);
}

