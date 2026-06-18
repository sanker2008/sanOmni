import { forwardRef, useEffect, useRef, useImperativeHandle, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Move, RotateCcw, Maximize2 } from 'lucide-react';
import { SceneObject, CameraConfig, LightConfig, ObjectType, JointName } from './types';

const CHARACTER_JOINT_NAMES: JointName[] = [
  'spine', 'neck',
  'leftShoulder', 'leftElbow', 'leftWrist',
  'rightShoulder', 'rightElbow', 'rightWrist',
  'leftHip', 'leftKnee', 'leftAnkle',
  'rightHip', 'rightKnee', 'rightAnkle',
];

// ── Pure helpers defined OUTSIDE the component (stable, no re-creation) ──────

function buildCharacterGroup(): THREE.Group {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });

  const createPart = (geo: THREE.BufferGeometry, m: THREE.Material, yOff: number, zOff: number = 0) => {
    const mesh = new THREE.Mesh(geo, m.clone());
    mesh.position.set(0, yOff, zOff);
    mesh.castShadow = true;
    return mesh;
  };

  const createJoint = (name: string, yPos: number, xPos: number = 0, zPos: number = 0) => {
    const joint = new THREE.Group();
    joint.name = name;
    joint.position.set(xPos, yPos, zPos);
    joint.userData.jointName = name;
    return joint;
  };

  // Pelvis
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.9;
  root.add(pelvis);
  pelvis.add(createPart(new THREE.BoxGeometry(0.26, 0.18, 0.16), mat, 0));

  // Spine
  const spine = createJoint('spine', 0.09);
  pelvis.add(spine);
  spine.add(createPart(new THREE.BoxGeometry(0.28, 0.28, 0.17), mat, 0.14));

  // Neck & Head
  const neck = createJoint('neck', 0.28);
  spine.add(neck);
  neck.add(createPart(new THREE.SphereGeometry(0.12, 16, 16), mat, 0.12));

  // Arms
  const addArm = (isLeft: boolean) => {
    const sign = isLeft ? -1 : 1;
    const shoulder = createJoint(isLeft ? 'leftShoulder' : 'rightShoulder', 0.24, sign * 0.18);
    spine.add(shoulder);
    shoulder.add(createPart(new THREE.BoxGeometry(0.08, 0.26, 0.08), mat, -0.13));

    const elbow = createJoint(isLeft ? 'leftElbow' : 'rightElbow', -0.26);
    shoulder.add(elbow);
    elbow.add(createPart(new THREE.BoxGeometry(0.07, 0.26, 0.07), mat, -0.13));

    const wrist = createJoint(isLeft ? 'leftWrist' : 'rightWrist', -0.26);
    elbow.add(wrist);
    wrist.add(createPart(new THREE.BoxGeometry(0.04, 0.1, 0.08), mat, -0.05));
  };
  addArm(true);
  addArm(false);

  // Legs
  const addLeg = (isLeft: boolean) => {
    const sign = isLeft ? -1 : 1;
    const hip = createJoint(isLeft ? 'leftHip' : 'rightHip', -0.09, sign * 0.09);
    pelvis.add(hip);
    hip.add(createPart(new THREE.BoxGeometry(0.11, 0.4, 0.11), mat, -0.2));

    const knee = createJoint(isLeft ? 'leftKnee' : 'rightKnee', -0.4);
    hip.add(knee);
    knee.add(createPart(new THREE.BoxGeometry(0.09, 0.38, 0.09), mat, -0.19));

    const ankle = createJoint(isLeft ? 'leftAnkle' : 'rightAnkle', -0.38);
    knee.add(ankle);
    ankle.add(createPart(new THREE.BoxGeometry(0.1, 0.06, 0.18), mat, -0.03, 0.04));
  };
  addLeg(true);
  addLeg(false);

  return root;
}

function buildGeometry(type: ObjectType): THREE.BufferGeometry {
  switch (type) {
    case 'box':      return new THREE.BoxGeometry(1, 1, 1);
    case 'sphere':   return new THREE.SphereGeometry(0.5, 32, 32);
    case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case 'plane':    return new THREE.PlaneGeometry(10, 10);
    default:         return new THREE.BoxGeometry(1, 1, 1);
  }
}

/** Recursively dispose all geometries and materials of an object tree */
function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m: THREE.Material) => m.dispose());
      } else {
        (child.material as THREE.Material).dispose();
      }
    }
  });
}

/** Dispose a BoxHelper (LineSegments) */
function disposeHelper(h: THREE.BoxHelper) {
  h.geometry.dispose();
  (h.material as THREE.Material).dispose();
}

// ─────────────────────────────────────────────────────────────────────────────

interface ThreeSceneProps {
  objects: SceneObject[];
  lights: LightConfig;
  cameraConfig: CameraConfig;
  selectedObjectId: string | null;
  selectedJointName: string | null;
  onObjectSelect: (id: string | null, jointName?: string | null) => void;
  onUpdateObject: (id: string, updates: Partial<SceneObject>) => void;
}

export interface ThreeSceneRef {
  exportImage: (width: number, height: number, format: string, quality: number) => string;
}

const ThreeScene = forwardRef<ThreeSceneRef, ThreeSceneProps>(({
  objects,
  lights,
  cameraConfig,
  selectedObjectId,
  selectedJointName,
  onObjectSelect,
  onUpdateObject,
}, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);

  const sceneRef     = useRef<THREE.Scene | null>(null);
  const cameraRef    = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef  = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef  = useRef<OrbitControls | null>(null);
  const objectMeshesRef    = useRef<Map<string, THREE.Object3D>>(new Map());
  const selectionHelperRef = useRef<THREE.BoxHelper | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  
  useEffect(() => {
    if (selectedJointName) {
      setTransformMode('rotate');
    }
  }, [selectedJointName]);

  const selectionRef = useRef({ id: selectedObjectId, joint: selectedJointName });
  useEffect(() => { selectionRef.current = { id: selectedObjectId, joint: selectedJointName }; }, [selectedObjectId, selectedJointName]);

  const objectsRef = useRef(objects);
  useEffect(() => { objectsRef.current = objects; }, [objects]);

  const onUpdateObjectRef = useRef(onUpdateObject);
  useEffect(() => { onUpdateObjectRef.current = onUpdateObject; }, [onUpdateObject]);

  const lightsRef    = useRef<{
    ambient:     THREE.AmbientLight;
    directional: THREE.DirectionalLight;
    point:       THREE.PointLight;
    extraPoints: Map<string, THREE.PointLight>;
  } | null>(null);

  // ── Init (runs once) ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    const gridHelper = new THREE.GridHelper(20, 20);
    scene.add(gridHelper);

    const { clientWidth: w, clientHeight: h } = mountRef.current;
    const camera = new THREE.PerspectiveCamera(cameraConfig.fov, w / h, 0.1, 1000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(lights.ambientColor, lights.ambientIntensity);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(lights.directionalColor, lights.directionalIntensity);
    const dp = lights.directionalPosition;
    dirLight.position.set(dp.x, dp.y, dp.z);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const pp = lights.pointLightPosition;
    const pointLight = new THREE.PointLight(lights.pointLightColor, lights.pointLightIntensity, 100);
    pointLight.position.set(pp.x, pp.y, pp.z);
    if (lights.pointLightEnabled) scene.add(pointLight);

    lightsRef.current = { ambient: ambientLight, directional: dirLight, point: pointLight, extraPoints: new Map() };

    // TransformControls setup
    const tControls = new TransformControls(camera, renderer.domElement);
    tControls.addEventListener('dragging-changed', (event) => {
      if (controlsRef.current) controlsRef.current.enabled = !event.value;
      if (!event.value) {
        // Drag ended
        const { id, joint } = selectionRef.current;
        if (id) {
          const mesh = objectMeshesRef.current.get(id);
          const objState = objectsRef.current.find(o => o.id === id);
          if (mesh && objState) {
            if (joint) {
              const jointGroup = mesh.getObjectByName(joint);
              if (jointGroup) {
                const newJoints = {
                  ...(objState.joints || {}),
                  [joint]: {
                    ...(objState.joints?.[joint as JointName] || {}),
                    x: jointGroup.rotation.x,
                    y: jointGroup.rotation.y,
                    z: jointGroup.rotation.z,
                  }
                };
                onUpdateObjectRef.current(id, { joints: newJoints as any });
              }
            } else {
              onUpdateObjectRef.current(id, {
                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                rotation: { 
                  x: objState.type === 'plane' ? mesh.rotation.x + Math.PI / 2 : mesh.rotation.x, 
                  y: mesh.rotation.y, 
                  z: mesh.rotation.z 
                },
                scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
              });
            }
          }
        }
      }
    });
    const tHelper = tControls.getHelper() as THREE.Object3D;
    scene.add(tHelper);
    transformControlsRef.current = tControls;

    // Initial camera position from config (spherical coords → cartesian)
    const cfg = cameraConfig;
    controls.target.set(cfg.target.x, cfg.target.y, cfg.target.z);
    camera.position.set(
      cfg.target.x + cfg.distance * Math.sin(cfg.polarAngle) * Math.sin(cfg.azimuthalAngle),
      cfg.target.y + cfg.distance * Math.cos(cfg.polarAngle),
      cfg.target.z + cfg.distance * Math.sin(cfg.polarAngle) * Math.cos(cfg.azimuthalAngle),
    );
    controls.update();

    // Raycasting for object selection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      
      // If hovering over the transform controls gizmo (axis is truthy), let it handle the event.
      // Do not trigger new object selection to avoid losing focus.
      if (transformControlsRef.current && (transformControlsRef.current as any).axis !== null) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const targets = Array.from(objectMeshesRef.current.values());
      const hits = raycaster.intersectObjects(targets, true);

      if (hits.length > 0) {
        const hitObject = hits[0].object;

        // Traverse up to find joint name (if any)
        let curr: THREE.Object3D | null = hitObject;
        let jointName: string | null = null;
        while (curr && !curr.userData.jointName && !curr.userData.id) {
          curr = curr.parent;
        }
        if (curr?.userData.jointName) {
          jointName = curr.userData.jointName;
        }

        // Traverse further up to find the root object id
        let top: THREE.Object3D | null = curr;
        while (top && !top.userData.id) {
          top = top.parent;
        }

        if (top?.userData.id) {
          onObjectSelect(top.userData.id, jointName);
        }
      } else {
        onObjectSelect(null);
      }
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // Animation loop — helper.update() keeps the box in sync with moving objects
    let rafId: number;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      selectionHelperRef.current?.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!mountRef.current) return;
      const rw = mountRef.current.clientWidth;
      const rh = mountRef.current.clientHeight;
      renderer.setSize(rw, rh);
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      tControls.detach();
      const tHelper = tControls.getHelper() as THREE.Object3D;
      tControls.dispose();
      sceneRef.current?.remove(tHelper);

      objectMeshesRef.current.forEach(mesh => {
        sceneRef.current?.remove(mesh);
        disposeObject(mesh);
      });
      objectMeshesRef.current.clear();

      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync lights ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lightsRef.current) return;
    const { ambient: a, directional: d, point: p, extraPoints } = lightsRef.current;

    a.color.set(lights.ambientColor);
    a.intensity = lights.ambientIntensity;

    d.color.set(lights.directionalColor);
    d.intensity = lights.directionalIntensity;
    d.position.set(lights.directionalPosition.x, lights.directionalPosition.y, lights.directionalPosition.z);

    p.color.set(lights.pointLightColor);
    p.intensity = lights.pointLightIntensity;
    p.position.set(lights.pointLightPosition.x, lights.pointLightPosition.y, lights.pointLightPosition.z);

    if (lights.pointLightEnabled) {
      if (!sceneRef.current?.children.includes(p)) sceneRef.current?.add(p);
    } else {
      sceneRef.current?.remove(p);
    }

    const nextExtraLights = lights.extraPointLights ?? [];
    const nextIds = new Set(nextExtraLights.map(light => light.id));

    extraPoints.forEach((light, id) => {
      if (!nextIds.has(id)) {
        sceneRef.current?.remove(light);
        extraPoints.delete(id);
      }
    });

    nextExtraLights.forEach((cfg) => {
      let light = extraPoints.get(cfg.id);
      if (!light) {
        light = new THREE.PointLight(cfg.color, cfg.intensity, 100);
        extraPoints.set(cfg.id, light);
      }

      light.color.set(cfg.color);
      light.intensity = cfg.intensity;
      light.position.set(cfg.position.x, cfg.position.y, cfg.position.z);

      if (cfg.enabled) {
        if (!sceneRef.current?.children.includes(light)) sceneRef.current?.add(light);
      } else {
        sceneRef.current?.remove(light);
      }
    });
  }, [lights]);

  // ── Sync camera ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const cfg = cameraConfig;
    cameraRef.current.fov = cfg.fov;
    cameraRef.current.updateProjectionMatrix();
    controlsRef.current.target.set(cfg.target.x, cfg.target.y, cfg.target.z);
    cameraRef.current.position.set(
      cfg.target.x + cfg.distance * Math.sin(cfg.polarAngle) * Math.sin(cfg.azimuthalAngle),
      cfg.target.y + cfg.distance * Math.cos(cfg.polarAngle),
      cfg.target.z + cfg.distance * Math.sin(cfg.polarAngle) * Math.cos(cfg.azimuthalAngle),
    );
    controlsRef.current.update();
  }, [cameraConfig]);

  // ── Sync objects ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const meshes = objectMeshesRef.current;
    const nextIds = new Set(objects.map(o => o.id));

    // ① Remove stale objects — dispose GPU resources to prevent memory leak
    meshes.forEach((mesh, id) => {
      if (!nextIds.has(id)) {
        scene.remove(mesh);
        disposeObject(mesh);
        meshes.delete(id);
      }
    });

    // ② Add or update
    objects.forEach(obj => {
      let mesh = meshes.get(obj.id);

      if (!mesh) {
        if (obj.type === 'character') {
          mesh = buildCharacterGroup();

        } else if (obj.type === 'model' && obj.modelPath?.startsWith('blob:')) {
          const group = new THREE.Group();
          mesh = group;
          const loader = new GLTFLoader();
          loader.load(obj.modelPath, (gltf: any) => {
            const model: THREE.Object3D = gltf.scene;
            // ✅ Fix: subtract AABB center to truly center the model
            const box3 = new THREE.Box3().setFromObject(model);
            const center = box3.getCenter(new THREE.Vector3());
            const size   = box3.getSize(new THREE.Vector3()).length();
            model.position.sub(center);
            model.scale.setScalar(2 / size); // normalize to ~2 unit height
            group.add(model);
          });

        } else {
          const geo = buildGeometry(obj.type);
          const mat = new THREE.MeshStandardMaterial({
            color:       obj.color,
            wireframe:   obj.wireframe,
            transparent: obj.opacity < 1,
            opacity:     obj.opacity,
          });
          mesh = new THREE.Mesh(geo, mat);
          if (obj.type === 'plane') {
            (mesh as THREE.Mesh).receiveShadow = true;
          } else {
            (mesh as THREE.Mesh).castShadow = true;
            (mesh as THREE.Mesh).receiveShadow = true;
          }
        }

        mesh.userData.id = obj.id;
        scene.add(mesh);
        meshes.set(obj.id, mesh);
      }

      // Apply transform
      mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
      mesh.rotation.set(
        (obj.type === 'plane' ? -Math.PI / 2 : 0) + obj.rotation.x,
        obj.rotation.y,
        obj.rotation.z,
      );
      mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
      mesh.visible = obj.visible;

      // Material update for primitive shapes
      if (obj.type !== 'character' && obj.type !== 'model' && mesh instanceof THREE.Mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(obj.color);
        mat.wireframe   = obj.wireframe;
        mat.opacity     = obj.opacity;
        mat.transparent = obj.opacity < 1;
        mat.needsUpdate = true;
      }

      // Material update for character
      if (obj.type === 'character' && mesh instanceof THREE.Group) {
        mesh.traverse(child => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshStandardMaterial;
            mat.color.set(obj.color);
            mat.wireframe   = obj.wireframe;
            mat.opacity     = obj.opacity;
            mat.transparent = obj.opacity < 1;
            mat.needsUpdate = true;
          }
        });

        CHARACTER_JOINT_NAMES.forEach((jName) => {
          const jointGroup = mesh!.getObjectByName(jName);
          jointGroup?.rotation.set(0, 0, 0);
        });

        Object.entries(obj.joints || {}).forEach(([jName, rot]) => {
          const jointGroup = mesh!.getObjectByName(jName);
          if (jointGroup && rot) {
            jointGroup.rotation.set(rot.x, rot.y, rot.z);
          }
        });
      }
    });
  }, [objects]);

  // ── Selection highlight (BoxHelper) ──────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // Remove and dispose existing helper
    if (selectionHelperRef.current) {
      scene.remove(selectionHelperRef.current);
      disposeHelper(selectionHelperRef.current);
      selectionHelperRef.current = null;
    }

    if (transformControlsRef.current) {
      transformControlsRef.current.detach();
    }

    if (selectedObjectId) {
      const mesh = objectMeshesRef.current.get(selectedObjectId);
      if (mesh) {
        let target: THREE.Object3D = mesh;
        if (selectedJointName) {
          const joint = mesh.getObjectByName(selectedJointName);
          if (joint) target = joint;
        }
        const helper = new THREE.BoxHelper(target, selectedJointName ? 0x00ff00 : 0xffcc00);
        scene.add(helper);
        selectionHelperRef.current = helper;

        if (transformControlsRef.current) {
          transformControlsRef.current.attach(target);
          transformControlsRef.current.setMode(transformMode);
        }
      }
    }
  }, [selectedObjectId, selectedJointName, objects, transformMode]); 

  // ── Hotkeys ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 't' || e.key === 'T') setTransformMode('translate');
      if (e.key === 'r' || e.key === 'R') setTransformMode('rotate');
      if (e.key === 's' || e.key === 'S') setTransformMode('scale');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Export ───────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    exportImage: (width: number, height: number, format: string, quality: number): string => {
      if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return '';
      const renderer = rendererRef.current;
      const camera   = cameraRef.current;
      const scene    = sceneRef.current;

      const origW      = renderer.domElement.width;
      const origH      = renderer.domElement.height;
      const origAspect = camera.aspect;

      // Hide grid, helper, and transform controls for a clean export
      const hidden: THREE.Object3D[] = [];
      const tHelper = transformControlsRef.current ? (transformControlsRef.current as any).getHelper() : null;
      scene.children.forEach(child => {
        if (child instanceof THREE.GridHelper || child instanceof THREE.BoxHelper || child === tHelper) {
          child.visible = false;
          hidden.push(child);
        }
      });

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);

      const dataUrl = renderer.domElement.toDataURL(format, quality);

      // Restore
      hidden.forEach(h => (h.visible = true));
      renderer.setSize(origW, origH, false);
      camera.aspect = origAspect;
      camera.updateProjectionMatrix();

      return dataUrl;
    },
  }));

  return (
    <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div className="absolute top-4 left-4 bg-background/80 backdrop-blur border border-border p-1 rounded-md flex gap-1 shadow-sm">
        <button 
           className={`p-1.5 rounded-sm ${transformMode === 'translate' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
           onClick={() => setTransformMode('translate')}
           title="移动 (T)"
        >
           <Move className="w-4 h-4" />
        </button>
        <button 
           className={`p-1.5 rounded-sm ${transformMode === 'rotate' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
           onClick={() => setTransformMode('rotate')}
           title="旋转 (R)"
        >
           <RotateCcw className="w-4 h-4" />
        </button>
        <button 
           className={`p-1.5 rounded-sm ${transformMode === 'scale' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
           onClick={() => setTransformMode('scale')}
           title="缩放 (S)"
        >
           <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
});

export default ThreeScene;
