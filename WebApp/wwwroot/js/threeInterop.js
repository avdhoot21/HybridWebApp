let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls, composer, outlinePass, pointLight;

window.initThreeJs = (canvasId, modelPath, modelPoints) => {
    const canvas = document.getElementById(canvasId);
    console.log('Model path:', modelPath);
    console.log('Model points:', modelPoints);
    if (!canvas) {
        console.error('Canvas element not found:', canvasId);
        return;
    }
    const container = canvas.parentElement;
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    // Initialize Scene
    scene = new THREE.Scene();

    // Camera Setup
    camera = new THREE.PerspectiveCamera(15, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5); // Fixed initial distance for normalized size

    // Renderer Setup
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);

    // Post-Processing (Outline only)
    composer = new THREE.EffectComposer(renderer);
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Outline Effect
    try {
        outlinePass = new THREE.OutlinePass(new THREE.Vector2(width, height), scene, camera);
        outlinePass.edgeStrength = 3.0;
        outlinePass.edgeGlow = 0.5;
        outlinePass.edgeThickness = 1.0;
        outlinePass.visibleEdgeColor.set(0xffff00);
        composer.addPass(outlinePass);
    } catch (e) {
        console.warn('Failed to initialize OutlinePass:', e);
        composer = null; // Fallback to standard rendering
    }

    // Orbit Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = false;
    controls.minDistance = 2; // Allow closer zoom
    controls.maxDistance = 20; // Adjusted max distance for fixed size
    controls.maxPolarAngle = Math.PI / 2; // Prevent looking above/below
    controls.autoRotate = false;
    controls.autoRotateSpeed = 1.0;
    controls.target.set(0, 0, 0); // Look at origin

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    pointLight = new THREE.PointLight(0xffffff, 2.0, 15);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(-5, 5, 5);
    scene.add(directionalLight);

    // Environment Map (for realistic reflections)
    const cubeTextureLoader = new THREE.CubeTextureLoader();
    const envMap = cubeTextureLoader.load([
        'https://threejs.org/examples/textures/cube/Bridge2/posx.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/negx.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/posy.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/negy.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/posz.jpg',
        'https://threejs.org/examples/textures/cube/Bridge2/negz.jpg'
    ], () => {
        console.log('Environment map loaded');
    }, undefined, (error) => {
        console.warn('Failed to load environment map:', error);
    });
    scene.environment = envMap;

    // Raycaster and Mouse
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    if (points.length > 0) {
        window.clearPoints();
    }
    let model;
    const loader = new THREE.GLTFLoader();
    let font;
    try {
        const fontLoader = new THREE.FontLoader();
        fontLoader.load(
            'https://unpkg.com/three@0.134.0/examples/fonts/helvetiker_regular.typeface.json',
            (loadedFont) => {
                font = loadedFont;
                console.log('Font loaded for 3D text labels');
            },
            undefined,
            (error) => {
                console.warn('Error loading font, skipping 3D text labels:', error);
            }
        );
    } catch (e) {
        console.warn('FontLoader initialization failed:', e);
    }

    //// Define color mappings based on statusValue
    //const statusColors = {
    //    'NewStatusKey': getComputedStyle(document.documentElement).getPropertyValue('--primary-app-color').trim(),
    //    'InProgressStatusKey': getComputedStyle(document.documentElement).getPropertyValue('--secondary-app-color').trim(),
    //    'CompletedStatusKey': getComputedStyle(document.documentElement).getPropertyValue('--tertiary-app-color').trim()
    //};

    // Load Model
    loader.load(
        modelPath,
        (gltf) => {
            model = gltf.scene;
            scene.add(model);
            model.position.set(0, 0, 0);

            // Orient model to face forward (Blender +Y forward, facing camera at +Z)
            model.rotation.set(0, Math.PI / 12, 0); // Rotate 90 degrees around Y

            // Scale and center with fixed size
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            const maxDimension = Math.max(size.x, size.y, size.z);
            const targetSize = 1.0; // Normalize to a max dimension of 1 unit
            if (maxDimension > 0) {
                const scaleFactor = targetSize / maxDimension;
                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
                console.log('Applied scale factor:', scaleFactor);
            }

            // Center model
            model.position.sub(center.multiplyScalar(model.scale.x));

            // Parse modelPoints
            let parsedModelPoints = modelPoints;
            if (typeof modelPoints === 'string') {
                try {
                    parsedModelPoints = JSON.parse(modelPoints);
                } catch (e) {
                    console.error('Error parsing modelPoints:', e);
                    return;
                }
            }

            console.log('Received modelPoints:', parsedModelPoints);

            // Add Points with status-based colors and tick mark for completed
            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
                parsedModelPoints.forEach((point, index) => {
                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
                        console.error('Invalid point data:', point);
                        return;
                    }

                    const x = point.position[0] * model.scale.x;
                    const y = point.position[1] * model.scale.y;
                    const z = point.position[2] * model.scale.z;
                    const pointPosition = new THREE.Vector3(x, y, z);

                    // Determine color based on statusColor
                    let pointColor = 0xffff00; // Default color (yellow) if statusColor is invalid
                    let isClickable = true;
                    if (point.statusColor) {
                        try {
                            pointColor = point.statusColor; // Use statusColor from modelPoints
                        } catch (e) {
                            console.warn(`Invalid statusColor for point ${point.id}:`, point.statusColor, e);
                        }
                    }
                    if (point.statusValue === 'CompletedStatusKey') {
                        isClickable = false; // Disable click for completed points
                    }

                    // Point material with status-based color
                    const pointMaterial = new THREE.MeshBasicMaterial({
                        color: pointColor,
                        transparent: true,
                        opacity: point.statusValue === 'CompletedStatusKey' ? 0.5 : 0.8 // Lower opacity for disabled
                    });
                    const pointGeometry = new THREE.SphereGeometry(0.02, 32, 32);
                    const sphere = new THREE.Mesh(pointGeometry, pointMaterial);
                    sphere.position.copy(pointPosition);
                    sphere.name = point.id;
                    sphere.userData.isClickable = isClickable; // Store clickability state
                    scene.add(sphere);
                    points.push(sphere);

                    // Add 3D text label
                    if (font) {
                        try {
                            const textGeometry = new THREE.TextGeometry(point.id, {
                                font: font,
                                size: 0.05,
                                height: 0.01
                            });
                            const textMaterial = new THREE.MeshBasicMaterial({
                                color: point.statusValue === 'CompletedStatusKey' ? 0x6c757d : 0xffffff
                            });
                            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
                            textMesh.position.copy(pointPosition).add(new THREE.Vector3(0.1, 0, 0));
                            scene.add(textMesh);
                            sphere.userData.textLabel = textMesh;

                            // Add tick mark for completed points
                            if (point.statusValue === 'CompletedStatusKey') {
                                const tickGeometry = new THREE.TextGeometry('✔', {
                                    font: font,
                                    size: 0.05,
                                    height: 0.01
                                });
                                const tickMaterial = new THREE.MeshBasicMaterial({ color: 0x6c757d }); // Grey tick mark
                                const tickMesh = new THREE.Mesh(tickGeometry, tickMaterial);
                                tickMesh.position.copy(pointPosition).add(new THREE.Vector3(-0.05, 0.05, 0)); // Offset above sphere
                                scene.add(tickMesh);
                                sphere.userData.tickMark = tickMesh; // Store reference for cleanup
                            }
                        } catch (e) {
                            console.warn('Failed to create text label or tick mark for point:', point.id, e);
                        }
                    }

                    sphere.userData.model = model;
                    console.log(`Point added: ${point.id} at world [${x}, ${y}, ${z}] with status ${point.statusValue}`);
                });
            } else {
                console.error('modelPoints is not a valid array:', parsedModelPoints);
            }

            // Adjust camera for fixed size
            const cameraDistance = 5; // Fixed distance for normalized size of 1 unit
            camera.position.set(0, 0.5, cameraDistance); // Camera above and at fixed distance
            controls.target.set(0, 0, 0); // Look at model center
            controls.update();
        },
        (progress) => {
            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading GLTF model:', error);
        }
    );

    // Create UI Overlay (only auto-rotate button)
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '10px';
    uiContainer.style.right = '10px';
    uiContainer.style.display = 'flex';
    uiContainer.style.flexDirection = 'column';
    uiContainer.style.gap = '10px';
    container.appendChild(uiContainer);

    // Create Tooltip
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.background = 'rgba(0, 0, 0, 0.9)';
    tooltip.style.color = '#fff';
    tooltip.style.padding = '8px 12px';
    tooltip.style.borderRadius = '8px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    tooltip.style.fontSize = '14px';
    tooltip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    document.body.appendChild(tooltip);

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();

        points.forEach(point => {
            if (point.userData.isAnimating && point.userData.cameraAnimation) {
                const elapsed = Date.now() - point.userData.cameraAnimation.start;
                const progress = Math.min(elapsed / point.userData.cameraAnimation.duration, 1);
                const ease = 1 - Math.pow(1 - progress, 3);

                camera.position.lerpVectors(
                    point.userData.cameraAnimation.startPos,
                    point.userData.cameraAnimation.targetPos,
                    ease
                );
                controls.target.lerpVectors(
                    point.userData.cameraAnimation.startTarget,
                    point.userData.cameraAnimation.targetPoint,
                    ease
                );
                pointLight.position.lerpVectors(
                    point.userData.cameraAnimation.startLightPos,
                    point.userData.cameraAnimation.targetPoint,
                    ease
                );
                controls.update();

                if (outlinePass) {
                    outlinePass.selectedObjects = [point.userData.model];
                }

                if (point.userData.particles) {
                    const particleProgress = Math.min(elapsed / 500, 1);
                    const particleEase = 1 - Math.pow(1 - particleProgress, 2);
                    point.userData.particles.material.opacity = 1 - particleEase;
                    point.userData.particles.geometry.attributes.position.array.forEach((_, i) => {
                        if (i % 3 === 0) {
                            const index = i / 3;
                            point.userData.particles.geometry.attributes.position.array[i] += point.userData.particleVelocities[index].x * particleEase * 0.01;
                            point.userData.particles.geometry.attributes.position.array[i + 1] += point.userData.particleVelocities[index].y * particleEase * 0.01;
                            point.userData.particles.geometry.attributes.position.array[i + 2] += point.userData.particleVelocities[index].z * particleEase * 0.01;
                        }
                    });
                    point.userData.particles.geometry.attributes.position.needsUpdate = true;
                    if (particleProgress >= 1) {
                        scene.remove(point.userData.particles);
                        delete point.userData.particles;
                        delete point.userData.particleVelocities;
                    }
                }

                if (progress >= 1) {
                    point.userData.isAnimating = false;
                    delete point.userData.cameraAnimation;
                    if (outlinePass) {
                        outlinePass.selectedObjects = [];
                    }
                }
            }
        });

        if (composer) {
            composer.render();
        } else {
            renderer.render(scene, camera);
        }
    }
    animate();

    // Resize Handler
    window.addEventListener('resize', () => {
        const newWidth = container.offsetWidth;
        const newHeight = container.offsetHeight;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
        if (composer) {
            composer.setSize(newWidth, newHeight);
            if (outlinePass) {
                outlinePass.setSize(newWidth, newHeight);
            }
        }
    });

    // Click Handler
    canvas.addEventListener('click', (event) => {
        event.preventDefault();
        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const intersectsPoints = raycaster.intersectObjects(points, false);
        const intersectsModel = raycaster.intersectObject(model, true);

        controls.autoRotate = false;

        // Log model click coordinates
        if (intersectsModel.length > 0) {
            const intersection = intersectsModel[0];
            const pos = intersection.point; // World space coordinates
            console.log(`Clicked model at coordinates (world space): x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

            // Convert to model local space
            pos.applyMatrix4(new THREE.Matrix4().copy(model.matrixWorld).invert());
            console.log(`Clicked model at coordinates (local space): x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
        }

        // Handle point clicks
        if (intersectsPoints.length > 0) {
            const intersection = intersectsPoints[0];
            const pos = intersection.point;
            const clickedPoint = intersection.object;

            // Only process click if the point is clickable
            if (clickedPoint.userData.isClickable) {
                console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

                points.forEach(p => {
                    p.userData.isAnimating = false;
                    delete p.userData.cameraAnimation;
                    if (p.userData.particles) {
                        scene.remove(p.userData.particles);
                        delete p.userData.particles;
                        delete p.userData.particleVelocities;
                    }
                });

                clickedPoint.userData.isAnimating = true;
                clickedPoint.userData.cameraAnimation = {
                    start: Date.now(),
                    duration: 1000,
                    startPos: camera.position.clone(),
                    targetPos: pos.clone().add(new THREE.Vector3(0, 0, 0.5)),
                    startTarget: controls.target.clone(),
                    targetPoint: pos.clone(),
                    startLightPos: pointLight.position.clone()
                };

                const particleCount = 20;
                const positions = new Float32Array(particleCount * 3);
                const velocities = [];
                for (let i = 0; i < particleCount; i++) {
                    positions[i * 3] = pos.x;
                    positions[i * 3 + 1] = pos.y;
                    positions[i * 3 + 2] = pos.z;
                    velocities.push(new THREE.Vector3(
                        (Math.random() - 0.5) * 2,
                        (Math.random() - 0.5) * 2,
                        (Math.random() - 0.5) * 2
                    ).normalize());
                }
                const particleGeometry = new THREE.BufferGeometry();
                particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                const particleMaterial = new THREE.PointsMaterial({
                    color: new THREE.Color(`hsl(${Math.random() * 360}, 70%, 50%)`),
                    size: 0.05,
                    transparent: true,
                    opacity: 1
                });
                const particles = new THREE.Points(particleGeometry, particleMaterial);
                scene.add(particles);
                clickedPoint.userData.particles = particles;
                clickedPoint.userData.particleVelocities = velocities;

                if (onClickCallback) {
                    onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
                }
            } else {
                console.log(`Clicked point ${clickedPoint.name} is disabled (CompletedStatusKey)`);
            }
        } else if (intersectsModel.length === 0) {
            const rayDirection = raycaster.ray.direction.clone();
            const rayOrigin = raycaster.ray.origin.clone();
            const distance = 5;
            const pos = rayOrigin.add(rayDirection.multiplyScalar(distance));
            console.log(`Clicked empty space at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
        }
    });

    // Mouse Move Handler
    canvas.addEventListener('mousemove', (event) => {
        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(points, false);

        points.forEach(point => {
            if (point.userData.textLabel) {
                point.userData.textLabel.scale.set(1, 1, 1);
            }
        });
        tooltip.style.display = 'none';

        if (intersects.length > 0) {
            const hoveredPoint = intersects[0].object;
            if (!hoveredPoint.userData.isAnimating) {
                if (hoveredPoint.userData.textLabel) {
                    hoveredPoint.userData.textLabel.scale.set(1.5, 1.5, 1.5);
                }
                tooltip.style.display = 'block';
                tooltip.innerText = hoveredPoint.name;
                tooltip.style.left = `${event.clientX + 15}px`;
                tooltip.style.top = `${event.clientY + 15}px`;
            }
        }
    });

    // Starry Background
    function createStarryBackground() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 1000;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 2000;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
        }
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 2,
            transparent: true,
            opacity: 0.8
        });
        const stars = new THREE.Points(starGeometry, starMaterial);
        scene.add(stars);
        return null;
    }
};

window.toggleAutoRotate = (enable) => {
    if (controls) {
        controls.autoRotate = enable;
        console.log(`Auto-rotation ${enable ? 'enabled' : 'disabled'}`);
    }
};

window.registerClickCallback = (dotNetObject) => {
    onClickCallback = dotNetObject;
};

window.clearPoints = () => {
    points.forEach(point => {
        if (point.userData.textLabel) {
            scene.remove(point.userData.textLabel);
        }
        if (point.userData.tickMark) {
            scene.remove(point.userData.tickMark); // Clean up tick mark
        }
        scene.remove(point);
    });
    points = []; // Reset the points array
};




//let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls, composer, outlinePass, pointLight;

//window.initThreeJs = (canvasId, modelPath, modelPoints) => {
//    const canvas = document.getElementById(canvasId);
//    console.log('Model path:', modelPath);
//    console.log('Model points:', modelPoints);
//    if (!canvas) {
//        console.error('Canvas element not found:', canvasId);
//        return;
//    }
//    const container = canvas.parentElement;
//    const width = container.offsetWidth;
//    const height = container.offsetHeight;

//    // Initialize Scene
//    scene = new THREE.Scene();
//    scene.background = createStarryBackground();

//    // Camera Setup
//    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000); // Increased FOV for better view
//    camera.position.set(0, 0.5, 5); // Adjusted initial position

//    // Renderer Setup
//    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
//    renderer.setPixelRatio(window.devicePixelRatio);
//    renderer.setSize(width, height);

//    // Post-Processing (Outline only)
//    composer = new THREE.EffectComposer(renderer);
//    const renderPass = new THREE.RenderPass(scene, camera);
//    composer.addPass(renderPass);

//    try {
//        outlinePass = new THREE.OutlinePass(new THREE.Vector2(width, height), scene, camera);
//        outlinePass.edgeStrength = 3.0;
//        outlinePass.edgeGlow = 0.5;
//        outlinePass.edgeThickness = 1.0;
//        outlinePass.visibleEdgeColor.set(0xffff00);
//        composer.addPass(outlinePass);
//    } catch (e) {
//        console.warn('Failed to initialize OutlinePass:', e);
//        composer = null; // Fallback to standard rendering
//    }

//    // Orbit Controls
//    controls = new THREE.OrbitControls(camera, renderer.domElement);
//    controls.enableDamping = true;
//    controls.dampingFactor = 0.1;
//    controls.screenSpacePanning = true; // Allow panning in all directions
//    controls.minDistance = 1; // Closer zoom
//    controls.maxDistance = 15; // Reasonable max distance
//    controls.maxPolarAngle = Math.PI / 1.8; // Slightly more vertical freedom
//    controls.autoRotate = false;
//    controls.autoRotateSpeed = 1.0;
//    controls.target.set(0, 0, 0);
//    controls.enablePan = true; // Enable panning
//    controls.panSpeed = 0.5; // Slower panning for precision
//    controls.zoomSpeed = 1.0; // Adjusted zoom speed
//    controls.rotateSpeed = 0.5; // Slower rotation for better control
//    controls.enableZoom = true; // Explicitly enable zooming

//    // Lighting
//    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
//    scene.add(ambientLight);
//    pointLight = new THREE.PointLight(0xffffff, 2.0, 15);
//    pointLight.position.set(5, 5, 5);
//    scene.add(pointLight);
//    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
//    directionalLight.position.set(-5, 5, 5);
//    scene.add(directionalLight);

//    // Environment Map
//    const cubeTextureLoader = new THREE.CubeTextureLoader();
//    const envMap = cubeTextureLoader.load([
//        'https://threejs.org/examples/textures/cube/Bridge2/posx.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/negx.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/posy.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/negy.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/posz.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/negz.jpg'
//    ], () => {
//        console.log('Environment map loaded');
//    }, undefined, (error) => {
//        console.warn('Failed to load environment map:', error);
//    });
//    scene.environment = envMap;

//    // Raycaster and Mouse
//    raycaster = new THREE.Raycaster();
//    mouse = new THREE.Vector2();

//    let model;
//    const loader = new THREE.GLTFLoader();
//    let font;
//    try {
//        const fontLoader = new THREE.FontLoader();
//        fontLoader.load(
//            'https://unpkg.com/three@0.134.0/examples/fonts/helvetiker_regular.typeface.json',
//            (loadedFont) => {
//                font = loadedFont;
//                console.log('Font loaded for 3D text labels');
//            },
//            undefined,
//            (error) => {
//                console.warn('Error loading font, skipping 3D text labels:', error);
//            }
//        );
//    } catch (e) {
//        console.warn('FontLoader initialization failed:', e);
//    }

//    // Load Model
//    loader.load(
//        modelPath,
//        (gltf) => {
//            model = gltf.scene;
//            scene.add(model);
//            model.position.set(0, 0, 0);

//            // Orient model to face forward
//            model.rotation.set(0, Math.PI / 12, 0); // Adjusted for Blender +Y forward

//            // Scale and center
//            const box = new THREE.Box3().setFromObject(model);
//            const size = new THREE.Vector3();
//            box.getSize(size);
//            const center = new THREE.Vector3();
//            box.getCenter(center);

//            const maxDimension = Math.max(size.x, size.y, size.z);
//            const targetSize = 1.0; // Normalize to 1 unit
//            if (maxDimension > 0) {
//                const scaleFactor = targetSize / maxDimension;
//                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
//                console.log('Applied scale factor:', scaleFactor);
//            }

//            // Center model
//            model.position.sub(center.multiplyScalar(model.scale.x));

//            // Parse modelPoints
//            let parsedModelPoints = modelPoints;
//            if (typeof modelPoints === 'string') {
//                try {
//                    parsedModelPoints = JSON.parse(modelPoints);
//                } catch (e) {
//                    console.error('Error parsing modelPoints:', e);
//                    return;
//                }
//            }

//            console.log('Received modelPoints:', parsedModelPoints);

//            // Add Points
//            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
//                parsedModelPoints.forEach((point, index) => {
//                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
//                        console.error('Invalid point data:', point);
//                        return;
//                    }

//                    const x = point.position[0] * model.scale.x;
//                    const y = point.position[1] * model.scale.y;
//                    const z = point.position[2] * model.scale.z;
//                    const pointPosition = new THREE.Vector3(x, y, z);

//                    // Simple point material
//                    const pointMaterial = new THREE.MeshBasicMaterial({
//                        color: 0xffff00,
//                        transparent: true,
//                        opacity: 0.8
//                    });
//                    const pointGeometry = new THREE.SphereGeometry(0.02, 32, 32);
//                    const sphere = new THREE.Mesh(pointGeometry, pointMaterial);
//                    sphere.position.copy(pointPosition);
//                    sphere.name = point.id;
//                    scene.add(sphere);
//                    points.push(sphere);

//                    // Add 3D text label
//                    if (font) {
//                        try {
//                            const textGeometry = new THREE.TextGeometry(point.id, {
//                                font: font,
//                                size: 0.05,
//                                height: 0.01
//                            });
//                            const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
//                            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
//                            textMesh.position.copy(pointPosition).add(new THREE.Vector3(0.1, 0, 0));
//                            scene.add(textMesh);
//                            sphere.userData.textLabel = textMesh;
//                        } catch (e) {
//                            console.warn('Failed to create text label for point:', point.id, e);
//                        }
//                    }

//                    sphere.userData.model = model;
//                    console.log(`Point added: ${point.id} at world [${x}, ${y}, ${z}]`);
//                });
//            } else {
//                console.error('modelPoints is not a valid array:', parsedModelPoints);
//            }

//            // Adjust camera to fit model
//            const cameraDistance = size.length() * 2.5; // Dynamic distance based on model size
//            camera.position.set(0, size.y * 0.5, cameraDistance);
//            controls.target.copy(center);
//            controls.update();
//        },
//        (progress) => {
//            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
//        },
//        (error) => {
//            console.error('Error loading GLTF model:', error);
//        }
//    );

//    // Create UI Overlay
//    const uiContainer = document.createElement('div');
//    uiContainer.style.position = 'absolute';
//    uiContainer.style.top = '10px';
//    uiContainer.style.right = '10px';
//    uiContainer.style.display = 'flex';
//    uiContainer.style.flexDirection = 'column';
//    uiContainer.style.gap = '10px';
//    container.appendChild(uiContainer);

//    // Auto-Rotate Button
//    const autoRotateBtn = document.createElement('button');
//    autoRotateBtn.innerText = 'Toggle Auto-Rotate';
//    autoRotateBtn.style.padding = '8px 12px';
//    autoRotateBtn.style.background = '#333';
//    autoRotateBtn.style.color = '#fff';
//    autoRotateBtn.style.border = 'none';
//    autoRotateBtn.style.borderRadius = '5px';
//    autoRotateBtn.style.cursor = 'pointer';
//    autoRotateBtn.addEventListener('click', () => window.toggleAutoRotate(!controls.autoRotate));
//    uiContainer.appendChild(autoRotateBtn);

//    // Reset View Button
//    const resetViewBtn = document.createElement('button');
//    resetViewBtn.innerText = 'Reset View';
//    resetViewBtn.style.padding = '8px 12px';
//    resetViewBtn.style.background = '#333';
//    resetViewBtn.style.color = '#fff';
//    resetViewBtn.style.border = 'none';
//    resetViewBtn.style.borderRadius = '5px';
//    resetViewBtn.style.cursor = 'pointer';
//    resetViewBtn.addEventListener('click', () => {
//        const box = new THREE.Box3().setFromObject(model);
//        const size = new THREE.Vector3();
//        box.getSize(size);
//        const center = new THREE.Vector3();
//        box.getCenter(center);
//        const cameraDistance = size.length() * 2.5;
//        camera.position.set(0, size.y * 0.5, cameraDistance);
//        controls.target.copy(center);
//        controls.autoRotate = false;
//        controls.update();
//        console.log('View reset to initial position');
//    });
//    uiContainer.appendChild(resetViewBtn);

//    // Create Tooltip
//    const tooltip = document.createElement('div');
//    tooltip.style.position = 'absolute';
//    tooltip.style.background = 'rgba(0, 0, 0, 0.9)';
//    tooltip.style.color = '#fff';
//    tooltip.style.padding = '8px 12px';
//    tooltip.style.borderRadius = '8px';
//    tooltip.style.pointerEvents = 'none';
//    tooltip.style.display = 'none';
//    tooltip.style.fontSize = '14px';
//    tooltip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
//    document.body.appendChild(tooltip);

//    // Animation Loop
//    function animate() {
//        requestAnimationFrame(animate);
//        controls.update();

//        points.forEach(point => {
//            if (point.userData.isAnimating && point.userData.cameraAnimation) {
//                const elapsed = Date.now() - point.userData.cameraAnimation.start;
//                const progress = Math.min(elapsed / point.userData.cameraAnimation.duration, 1);
//                const ease = 1 - Math.pow(1 - progress, 3);

//                camera.position.lerpVectors(
//                    point.userData.cameraAnimation.startPos,
//                    point.userData.cameraAnimation.targetPos,
//                    ease
//                );
//                controls.target.lerpVectors(
//                    point.userData.cameraAnimation.startTarget,
//                    point.userData.cameraAnimation.targetPoint,
//                    ease
//                );
//                pointLight.position.lerpVectors(
//                    point.userData.cameraAnimation.startLightPos,
//                    point.userData.cameraAnimation.targetPoint,
//                    ease
//                );
//                controls.update();

//                if (outlinePass) {
//                    outlinePass.selectedObjects = [point.userData.model];
//                }

//                if (point.userData.particles) {
//                    const particleProgress = Math.min(elapsed / 500, 1);
//                    const particleEase = 1 - Math.pow(1 - particleProgress, 2);
//                    point.userData.particles.material.opacity = 1 - particleEase;
//                    point.userData.particles.geometry.attributes.position.array.forEach((_, i) => {
//                        if (i % 3 === 0) {
//                            const index = i / 3;
//                            point.userData.particles.geometry.attributes.position.array[i] += point.userData.particleVelocities[index].x * particleEase * 0.01;
//                            point.userData.particles.geometry.attributes.position.array[i + 1] += point.userData.particleVelocities[index].y * particleEase * 0.01;
//                            point.userData.particles.geometry.attributes.position.array[i + 2] += point.userData.particleVelocities[index].z * particleEase * 0.01;
//                        }
//                    });
//                    point.userData.particles.geometry.attributes.position.needsUpdate = true;
//                    if (particleProgress >= 1) {
//                        scene.remove(point.userData.particles);
//                        delete point.userData.particles;
//                        delete point.userData.particleVelocities;
//                    }
//                }

//                if (progress >= 1) {
//                    point.userData.isAnimating = false;
//                    delete point.userData.cameraAnimation;
//                    if (outlinePass) {
//                        outlinePass.selectedObjects = [];
//                    }
//                }
//            }
//        });

//        if (composer) {
//            composer.render();
//        } else {
//            renderer.render(scene, camera);
//        }
//    }
//    animate();

//    // Resize Handler
//    window.addEventListener('resize', () => {
//        const newWidth = container.offsetWidth;
//        const newHeight = container.offsetHeight;
//        camera.aspect = newWidth / newHeight;
//        camera.updateProjectionMatrix();
//        renderer.setSize(newWidth, newHeight);
//        if (composer) {
//            composer.setSize(newWidth, newHeight);
//            if (outlinePass) {
//                outlinePass.setSize(newWidth, newHeight);
//            }
//        }
//    });

//    // Click Handler
//    canvas.addEventListener('click', (event) => {
//        event.preventDefault();
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);

//        const intersectsPoints = raycaster.intersectObjects(points, false);
//        const intersectsModel = raycaster.intersectObject(model, true);

//        controls.autoRotate = false;

//        // Log coordinates for model clicks
//        if (intersectsModel.length > 0) {
//            const intersection = intersectsModel[0];
//            const pos = intersection.point;
//            console.log(`Clicked model at coordinates (world space): x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

//            // Convert to local space
//            pos.applyMatrix4(new THREE.Matrix4().copy(model.matrixWorld).invert());
//            console.log(`Clicked model at coordinates (local space): x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
//        }

//        // Handle point clicks
//        if (intersectsPoints.length > 0) {
//            const intersection = intersectsPoints[0];
//            const pos = intersection.point;
//            const clickedPoint = intersection.object;

//            console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

//            points.forEach(p => {
//                p.userData.isAnimating = false;
//                delete p.userData.cameraAnimation;
//                if (p.userData.particles) {
//                    scene.remove(p.userData.particles);
//                    delete p.userData.particles;
//                    delete p.userData.particleVelocities;
//                }
//            });

//            clickedPoint.userData.isAnimating = true;
//            clickedPoint.userData.cameraAnimation = {
//                start: Date.now(),
//                duration: 1000,
//                startPos: camera.position.clone(),
//                targetPos: pos.clone().add(new THREE.Vector3(0, 0, 0.5)),
//                startTarget: controls.target.clone(),
//                targetPoint: pos.clone(),
//                startLightPos: pointLight.position.clone()
//            };

//            const particleCount = 20;
//            const positions = new Float32Array(particleCount * 3);
//            const velocities = [];
//            for (let i = 0; i < particleCount; i++) {
//                positions[i * 3] = pos.x;
//                positions[i * 3 + 1] = pos.y;
//                positions[i * 3 + 2] = pos.z;
//                velocities.push(new THREE.Vector3(
//                    (Math.random() - 0.5) * 2,
//                    (Math.random() - 0.5) * 2,
//                    (Math.random() - 0.5) * 2
//                ).normalize());
//            }
//            const particleGeometry = new THREE.BufferGeometry();
//            particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
//            const particleMaterial = new THREE.PointsMaterial({
//                color: new THREE.Color(`hsl(${Math.random() * 360}, 70%, 50%)`),
//                size: 0.05,
//                transparent: true,
//                opacity: 1
//            });
//            const particles = new THREE.Points(particleGeometry, particleMaterial);
//            scene.add(particles);
//            clickedPoint.userData.particles = particles;
//            clickedPoint.userData.particleVelocities = velocities;

//            if (onClickCallback) {
//                onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
//            }
//        } else if (intersectsModel.length === 0) {
//            const rayDirection = raycaster.ray.direction.clone();
//            const rayOrigin = raycaster.ray.origin.clone();
//            const distance = 5;
//            const pos = rayOrigin.add(rayDirection.multiplyScalar(distance));
//            console.log(`Clicked empty space at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
//        }
//    });

//    // Mouse Move Handler
//    canvas.addEventListener('mousemove', (event) => {
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        points.forEach(point => {
//            if (point.userData.textLabel) {
//                point.userData.textLabel.scale.set(1, 1, 1);
//            }
//        });
//        tooltip.style.display = 'none';

//        if (intersects.length > 0) {
//            const hoveredPoint = intersects[0].object;
//            if (!hoveredPoint.userData.isAnimating) {
//                if (hoveredPoint.userData.textLabel) {
//                    hoveredPoint.userData.textLabel.scale.set(1.5, 1.5, 1.5);
//                }
//                tooltip.style.display = 'block';
//                tooltip.innerText = hoveredPoint.name;
//                tooltip.style.left = `${event.clientX + 15}px`;
//                tooltip.style.top = `${event.clientY + 15}px`;
//            }
//        }
//    });

//    // Starry Background
//    function createStarryBackground() {
//        const starGeometry = new THREE.BufferGeometry();
//        const starCount = 1000;
//        const positions = new Float32Array(starCount * 3);
//        for (let i = 0; i < starCount; i++) {
//            positions[i * 3] = (Math.random() - 0.5) * 2000;
//            positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
//            positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
//        }
//        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
//        const starMaterial = new THREE.PointsMaterial({
//            color: 0xffffff,
//            size: 2,
//            transparent: true,
//            opacity: 0.8
//        });
//        const stars = new THREE.Points(starGeometry, starMaterial);
//        scene.add(stars);
//        return null;
//    }
//};

//window.toggleAutoRotate = (enable) => {
//    if (controls) {
//        controls.autoRotate = enable;
//        console.log(`Auto-rotation ${enable ? 'enabled' : 'disabled'}`);
//    }
//};

//window.registerClickCallback = (dotNetObject) => {
//    onClickCallback = dotNetObject;
//};



///MainCode
//let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls, composer, outlinePass, pointLight;

//window.initThreeJs = (canvasId, modelPath, modelPoints) => {
//    const canvas = document.getElementById(canvasId);
//    console.log('Model path:', modelPath);
//    console.log('Model points:', modelPoints);
//    if (!canvas) {
//        console.error('Canvas element not found:', canvasId);
//        return;
//    }
//    const container = canvas.parentElement;
//    const width = container.offsetWidth;
//    const height = container.offsetHeight;

//    // Initialize Scene
//    scene = new THREE.Scene();
//    scene.background = createStarryBackground();

//    // Camera Setup
//    camera = new THREE.PerspectiveCamera(15, width / height, 0.1, 1000);
//    camera.position.set(0, 0, 5); // Fixed initial distance for normalized size

//    // Renderer Setup
//    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
//    renderer.setPixelRatio(window.devicePixelRatio);
//    renderer.setSize(width, height);

//    // Post-Processing (Outline only)
//    composer = new THREE.EffectComposer(renderer);
//    const renderPass = new THREE.RenderPass(scene, camera);
//    composer.addPass(renderPass);

//    // Outline Effect
//    try {
//        outlinePass = new THREE.OutlinePass(new THREE.Vector2(width, height), scene, camera);
//        outlinePass.edgeStrength = 3.0;
//        outlinePass.edgeGlow = 0.5;
//        outlinePass.edgeThickness = 1.0;
//        outlinePass.visibleEdgeColor.set(0xffff00);
//        composer.addPass(outlinePass);
//    } catch (e) {
//        console.warn('Failed to initialize OutlinePass:', e);
//        composer = null; // Fallback to standard rendering
//    }

//    // Orbit Controls
//    controls = new THREE.OrbitControls(camera, renderer.domElement);
//    controls.enableDamping = true;
//    controls.dampingFactor = 0.1;
//    controls.screenSpacePanning = false;
//    controls.minDistance = 2; // Allow closer zoom
//    controls.maxDistance = 20; // Adjusted max distance for fixed size
//    controls.maxPolarAngle = Math.PI / 2; // Prevent looking above/below
//    controls.autoRotate = false;
//    controls.autoRotateSpeed = 1.0;
//    controls.target.set(0, 0, 0); // Look at origin

//    // Lighting
//    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
//    scene.add(ambientLight);
//    pointLight = new THREE.PointLight(0xffffff, 2.0, 15);
//    pointLight.position.set(5, 5, 5);
//    scene.add(pointLight);
//    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
//    directionalLight.position.set(-5, 5, 5);
//    scene.add(directionalLight);

//    // Environment Map (for realistic reflections)
//    const cubeTextureLoader = new THREE.CubeTextureLoader();
//    const envMap = cubeTextureLoader.load([
//        'https://threejs.org/examples/textures/cube/Bridge2/posx.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/negx.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/posy.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/negy.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/posz.jpg',
//        'https://threejs.org/examples/textures/cube/Bridge2/negz.jpg'
//    ], () => {
//        console.log('Environment map loaded');
//    }, undefined, (error) => {
//        console.warn('Failed to load environment map:', error);
//    });
//    scene.environment = envMap;

//    // Raycaster and Mouse
//    raycaster = new THREE.Raycaster();
//    mouse = new THREE.Vector2();

//    let model;
//    const loader = new THREE.GLTFLoader();
//    let font;
//    try {
//        const fontLoader = new THREE.FontLoader();
//        fontLoader.load(
//            'https://unpkg.com/three@0.134.0/examples/fonts/helvetiker_regular.typeface.json',
//            (loadedFont) => {
//                font = loadedFont;
//                console.log('Font loaded for 3D text labels');
//            },
//            undefined,
//            (error) => {
//                console.warn('Error loading font, skipping 3D text labels:', error);
//            }
//        );
//    } catch (e) {
//        console.warn('FontLoader initialization failed:', e);
//    }

//    // Load Model
//    loader.load(
//        modelPath,
//        (gltf) => {
//            model = gltf.scene;
//            scene.add(model);
//            model.position.set(0, 0, 0);

//            // Orient model to face forward (Blender +Y forward, facing camera at +Z)
//            model.rotation.set(0, Math.PI / 12, 0); // Rotate 90 degrees around Y

//            // Scale and center with fixed size
//            const box = new THREE.Box3().setFromObject(model);
//            const size = new THREE.Vector3();
//            box.getSize(size);
//            const center = new THREE.Vector3();
//            box.getCenter(center);

//            const maxDimension = Math.max(size.x, size.y, size.z);
//            const targetSize = 1.0; // Normalize to a max dimension of 1 unit
//            if (maxDimension > 0) {
//                const scaleFactor = targetSize / maxDimension;
//                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
//                console.log('Applied scale factor:', scaleFactor);
//            }

//            // Center model
//            model.position.sub(center.multiplyScalar(model.scale.x));

//            // Parse modelPoints
//            let parsedModelPoints = modelPoints;
//            if (typeof modelPoints === 'string') {
//                try {
//                    parsedModelPoints = JSON.parse(modelPoints);
//                } catch (e) {
//                    console.error('Error parsing modelPoints:', e);
//                    return;
//                }
//            }

//            console.log('Received modelPoints:', parsedModelPoints);

//            // Add Points (no glow, simple material)
//            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
//                parsedModelPoints.forEach((point, index) => {
//                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
//                        console.error('Invalid point data:', point);
//                        return;
//                    }

//                    const x = point.position[0] * model.scale.x;
//                    const y = point.position[1] * model.scale.y;
//                    const z = point.position[2] * model.scale.z;
//                    const pointPosition = new THREE.Vector3(x, y, z);

//                    // Simple point material (no glow)
//                    const pointMaterial = new THREE.MeshBasicMaterial({
//                        color: 0xffff00, // Yellow points
//                        transparent: true,
//                        opacity: 0.8
//                    });
//                    const pointGeometry = new THREE.SphereGeometry(0.02, 32, 32);
//                    const sphere = new THREE.Mesh(pointGeometry, pointMaterial);
//                    sphere.position.copy(pointPosition);
//                    sphere.name = point.id;
//                    scene.add(sphere);
//                    points.push(sphere);

//                    // Add 3D text label
//                    if (font) {
//                        try {
//                            const textGeometry = new THREE.TextGeometry(point.id, {
//                                font: font,
//                                size: 0.05,
//                                height: 0.01
//                            });
//                            const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
//                            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
//                            textMesh.position.copy(pointPosition).add(new THREE.Vector3(0.1, 0, 0));
//                            scene.add(textMesh);
//                            sphere.userData.textLabel = textMesh;
//                        } catch (e) {
//                            console.warn('Failed to create text label for point:', point.id, e);
//                        }
//                    }

//                    sphere.userData.model = model;
//                    console.log(`Point added: ${point.id} at world [${x}, ${y}, ${z}]`);
//                });
//            } else {
//                console.error('modelPoints is not a valid array:', parsedModelPoints);
//            }

//            // Adjust camera for fixed size
//            const cameraDistance = 5; // Fixed distance for normalized size of 1 unit
//            camera.position.set(0, 0.5, cameraDistance); // Camera above and at fixed distance
//            controls.target.set(0, 0, 0); // Look at model center
//            controls.update();
//        },
//        (progress) => {
//            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
//        },
//        (error) => {
//            console.error('Error loading GLTF model:', error);
//        }
//    );

//    // Create UI Overlay (only auto-rotate button)
//    const uiContainer = document.createElement('div');
//    uiContainer.style.position = 'absolute';
//    uiContainer.style.top = '10px';
//    uiContainer.style.right = '10px';
//    uiContainer.style.display = 'flex';
//    uiContainer.style.flexDirection = 'column';
//    uiContainer.style.gap = '10px';
//    container.appendChild(uiContainer);

//    // Auto-Rotate Button
//    const autoRotateBtn = document.createElement('button');
//    autoRotateBtn.innerText = 'Toggle Auto-Rotate';
//    autoRotateBtn.style.padding = '8px 12px';
//    autoRotateBtn.style.background = '#333';
//    autoRotateBtn.style.color = '#fff';
//    autoRotateBtn.style.border = 'none';
//    autoRotateBtn.style.borderRadius = '5px';
//    autoRotateBtn.style.cursor = 'pointer';
//    autoRotateBtn.addEventListener('click', () => window.toggleAutoRotate(!controls.autoRotate));
//    uiContainer.appendChild(autoRotateBtn);

//    // Create Tooltip
//    const tooltip = document.createElement('div');
//    tooltip.style.position = 'absolute';
//    tooltip.style.background = 'rgba(0, 0, 0, 0.9)';
//    tooltip.style.color = '#fff';
//    tooltip.style.padding = '8px 12px';
//    tooltip.style.borderRadius = '8px';
//    tooltip.style.pointerEvents = 'none';
//    tooltip.style.display = 'none';
//    tooltip.style.fontSize = '14px';
//    tooltip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
//    document.body.appendChild(tooltip);

//    // Animation Loop
//    function animate() {
//        requestAnimationFrame(animate);
//        controls.update();

//        points.forEach(point => {
//            if (point.userData.isAnimating && point.userData.cameraAnimation) {
//                const elapsed = Date.now() - point.userData.cameraAnimation.start;
//                const progress = Math.min(elapsed / point.userData.cameraAnimation.duration, 1);
//                const ease = 1 - Math.pow(1 - progress, 3);

//                camera.position.lerpVectors(
//                    point.userData.cameraAnimation.startPos,
//                    point.userData.cameraAnimation.targetPos,
//                    ease
//                );
//                controls.target.lerpVectors(
//                    point.userData.cameraAnimation.startTarget,
//                    point.userData.cameraAnimation.targetPoint,
//                    ease
//                );
//                pointLight.position.lerpVectors(
//                    point.userData.cameraAnimation.startLightPos,
//                    point.userData.cameraAnimation.targetPoint,
//                    ease
//                );
//                controls.update();

//                if (outlinePass) {
//                    outlinePass.selectedObjects = [point.userData.model];
//                }

//                if (point.userData.particles) {
//                    const particleProgress = Math.min(elapsed / 500, 1);
//                    const particleEase = 1 - Math.pow(1 - particleProgress, 2);
//                    point.userData.particles.material.opacity = 1 - particleEase;
//                    point.userData.particles.geometry.attributes.position.array.forEach((_, i) => {
//                        if (i % 3 === 0) {
//                            const index = i / 3;
//                            point.userData.particles.geometry.attributes.position.array[i] += point.userData.particleVelocities[index].x * particleEase * 0.01;
//                            point.userData.particles.geometry.attributes.position.array[i + 1] += point.userData.particleVelocities[index].y * particleEase * 0.01;
//                            point.userData.particles.geometry.attributes.position.array[i + 2] += point.userData.particleVelocities[index].z * particleEase * 0.01;
//                        }
//                    });
//                    point.userData.particles.geometry.attributes.position.needsUpdate = true;
//                    if (particleProgress >= 1) {
//                        scene.remove(point.userData.particles);
//                        delete point.userData.particles;
//                        delete point.userData.particleVelocities;
//                    }
//                }

//                if (progress >= 1) {
//                    point.userData.isAnimating = false;
//                    delete point.userData.cameraAnimation;
//                    if (outlinePass) {
//                        outlinePass.selectedObjects = [];
//                    }
//                }
//            }
//        });

//        if (composer) {
//            composer.render();
//        } else {
//            renderer.render(scene, camera);
//        }
//    }
//    animate();

//    // Resize Handler
//    window.addEventListener('resize', () => {
//        const newWidth = container.offsetWidth;
//        const newHeight = container.offsetHeight;
//        camera.aspect = newWidth / newHeight;
//        camera.updateProjectionMatrix();
//        renderer.setSize(newWidth, newHeight);
//        if (composer) {
//            composer.setSize(newWidth, newHeight);
//            if (outlinePass) {
//                outlinePass.setSize(newWidth, newHeight);
//            }
//        }
//    });
//    canvas.addEventListener('click', (event) => {
//        event.preventDefault();
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);

//        const intersectsPoints = raycaster.intersectObjects(points, false);
//        const intersectsModel = raycaster.intersectObject(model, true);

//        controls.autoRotate = false;

//        // Always log coordinates if model is clicked
//        if (intersectsModel.length > 0) {
//            const intersection = intersectsModel[0];
//            const pos = intersection.point; // World space coordinates of the intersection
//            console.log(`Clicked model at coordinates (world space): x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

//            // Optional: Convert to model local space
//            pos.applyMatrix4(new THREE.Matrix4().copy(model.matrixWorld).invert());
//            console.log(`Clicked model at coordinates (local space): x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
//        }

//        // Handle point clicks separately
//        if (intersectsPoints.length > 0) {
//            const intersection = intersectsPoints[0];
//            const pos = intersection.point;
//            const clickedPoint = intersection.object;

//            console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

//            points.forEach(p => {
//                p.userData.isAnimating = false;
//                delete p.userData.cameraAnimation;
//                if (p.userData.particles) {
//                    scene.remove(p.userData.particles);
//                    delete p.userData.particles;
//                    delete p.userData.particleVelocities;
//                }
//            });

//            clickedPoint.userData.isAnimating = true;
//            clickedPoint.userData.cameraAnimation = {
//                start: Date.now(),
//                duration: 1000,
//                startPos: camera.position.clone(),
//                targetPos: pos.clone().add(new THREE.Vector3(0, 0, 0.5)),
//                startTarget: controls.target.clone(),
//                targetPoint: pos.clone(),
//                startLightPos: pointLight.position.clone()
//            };

//            const particleCount = 20;
//            const positions = new Float32Array(particleCount * 3);
//            const velocities = [];
//            for (let i = 0; i < particleCount; i++) {
//                positions[i * 3] = pos.x;
//                positions[i * 3 + 1] = pos.y;
//                positions[i * 3 + 2] = pos.z;
//                velocities.push(new THREE.Vector3(
//                    (Math.random() - 0.5) * 2,
//                    (Math.random() - 0.5) * 2,
//                    (Math.random() - 0.5) * 2
//                ).normalize());
//            }
//            const particleGeometry = new THREE.BufferGeometry();
//            particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
//            const particleMaterial = new THREE.PointsMaterial({
//                color: new THREE.Color(`hsl(${Math.random() * 360}, 70%, 50%)`),
//                size: 0.05,
//                transparent: true,
//                opacity: 1
//            });
//            const particles = new THREE.Points(particleGeometry, particleMaterial);
//            scene.add(particles);
//            clickedPoint.userData.particles = particles;
//            clickedPoint.userData.particleVelocities = velocities;

//            if (onClickCallback) {
//                onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
//            }
//        } else if (intersectsModel.length === 0) {
//            const rayDirection = raycaster.ray.direction.clone();
//            const rayOrigin = raycaster.ray.origin.clone();
//            const distance = 5;
//            const pos = rayOrigin.add(rayDirection.multiplyScalar(distance));
//            console.log(`Clicked empty space at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
//        }
//    });
//    // Click Handler
//    //canvas.addEventListener('click', (event) => {
//    //    event.preventDefault();
//    //    mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//    //    mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//    //    raycaster.setFromCamera(mouse, camera);

//    //    const intersectsPoints = raycaster.intersectObjects(points, false);
//    //    const intersectsModel = raycaster.intersectObject(model, true);

//    //    controls.autoRotate = false;

//    //    if (intersectsPoints.length > 0) {
//    //        const intersection = intersectsPoints[0];
//    //        const pos = intersection.point;
//    //        const clickedPoint = intersection.object;

//    //        console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

//    //        points.forEach(p => {
//    //            p.userData.isAnimating = false;
//    //            delete p.userData.cameraAnimation;
//    //            if (p.userData.particles) {
//    //                scene.remove(p.userData.particles);
//    //                delete p.userData.particles;
//    //                delete p.userData.particleVelocities;
//    //            }
//    //        });

//    //        clickedPoint.userData.isAnimating = true;
//    //        clickedPoint.userData.cameraAnimation = {
//    //            start: Date.now(),
//    //            duration: 1000,
//    //            startPos: camera.position.clone(),
//    //            targetPos: pos.clone().add(new THREE.Vector3(0, 0, 0.5)),
//    //            startTarget: controls.target.clone(),
//    //            targetPoint: pos.clone(),
//    //            startLightPos: pointLight.position.clone()
//    //        };

//    //        const particleCount = 20;
//    //        const positions = new Float32Array(particleCount * 3);
//    //        const velocities = [];
//    //        for (let i = 0; i < particleCount; i++) {
//    //            positions[i * 3] = pos.x;
//    //            positions[i * 3 + 1] = pos.y;
//    //            positions[i * 3 + 2] = pos.z;
//    //            velocities.push(new THREE.Vector3(
//    //                (Math.random() - 0.5) * 2,
//    //                (Math.random() - 0.5) * 2,
//    //                (Math.random() - 0.5) * 2
//    //            ).normalize());
//    //        }
//    //        const particleGeometry = new THREE.BufferGeometry();
//    //        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
//    //        const particleMaterial = new THREE.PointsMaterial({
//    //            color: new THREE.Color(`hsl(${Math.random() * 360}, 70%, 50%)`),
//    //            size: 0.05,
//    //            transparent: true,
//    //            opacity: 1
//    //        });
//    //        const particles = new THREE.Points(particleGeometry, particleMaterial);
//    //        scene.add(particles);
//    //        clickedPoint.userData.particles = particles;
//    //        clickedPoint.userData.particleVelocities = velocities;

//    //        if (onClickCallback) {
//    //            onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
//    //        }
//    //    } else if (intersectsModel.length > 0) {
//    //        const intersection = intersectsModel[0];
//    //        const pos = intersection.point;
//    //        console.log(`Clicked model at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
//    //    } else {
//    //        const rayDirection = raycaster.ray.direction.clone();
//    //        const rayOrigin = raycaster.ray.origin.clone();
//    //        const distance = 5;
//    //        const pos = rayOrigin.add(rayDirection.multiplyScalar(distance));
//    //        console.log(`Clicked empty space at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
//    //    }
//    //});

//    // Mouse Move Handler
//    canvas.addEventListener('mousemove', (event) => {
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        points.forEach(point => {
//            if (point.userData.textLabel) {
//                point.userData.textLabel.scale.set(1, 1, 1);
//            }
//        });
//        tooltip.style.display = 'none';

//        if (intersects.length > 0) {
//            const hoveredPoint = intersects[0].object;
//            if (!hoveredPoint.userData.isAnimating) {
//                if (hoveredPoint.userData.textLabel) {
//                    hoveredPoint.userData.textLabel.scale.set(1.5, 1.5, 1.5);
//                }
//                tooltip.style.display = 'block';
//                tooltip.innerText = hoveredPoint.name;
//                tooltip.style.left = `${event.clientX + 15}px`;
//                tooltip.style.top = `${event.clientY + 15}px`;
//            }
//        }
//    });

//    // Starry Background
//    function createStarryBackground() {
//        const starGeometry = new THREE.BufferGeometry();
//        const starCount = 1000;
//        const positions = new Float32Array(starCount * 3);
//        for (let i = 0; i < starCount; i++) {
//            positions[i * 3] = (Math.random() - 0.5) * 2000;
//            positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
//            positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
//        }
//        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
//        const starMaterial = new THREE.PointsMaterial({
//            color: 0xffffff,
//            size: 2,
//            transparent: true,
//            opacity: 0.8
//        });
//        const stars = new THREE.Points(starGeometry, starMaterial);
//        scene.add(stars);
//        return null;
//    }
//};

//window.toggleAutoRotate = (enable) => {
//    if (controls) {
//        controls.autoRotate = enable;
//        console.log(`Auto-rotation ${enable ? 'enabled' : 'disabled'}`);
//    }
//};

//window.registerClickCallback = (dotNetObject) => {
//    onClickCallback = dotNetObject;
//};



//let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls, composer, outlinePass, pointLight;

//window.initThreeJs = (canvasId, modelPath, modelPoints) => {
//    const canvas = document.getElementById(canvasId);
//    console.log('Model path:', modelPath);
//    console.log('Model points:', modelPoints);
//    if (!canvas) {
//        console.error('Canvas element not found:', canvasId);
//        return;
//    }
//    const width = canvas.parentElement.offsetWidth;
//    const height = canvas.parentElement.offsetHeight;

//    scene = new THREE.Scene();

//    // Set gradient background
//    scene.background = createGradientBackground();

//    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
//    camera.position.set(0, 1.5, 3);

//    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
//    renderer.setSize(width, height);
//    renderer.shadowMap.enabled = false;

//    // Set up post-processing for outline effect
//    try {
//        composer = new THREE.EffectComposer(renderer);
//        const renderPass = new THREE.RenderPass(scene, camera);
//        composer.addPass(renderPass);
//        outlinePass = new THREE.OutlinePass(new THREE.Vector2(width, height), scene, camera);
//        outlinePass.edgeStrength = 3.0;
//        outlinePass.edgeGlow = 0.5;
//        outlinePass.edgeThickness = 1.0;
//        outlinePass.visibleEdgeColor.set(0xffff00);
//        composer.addPass(outlinePass);
//    } catch (e) {
//        console.warn('Failed to initialize OutlinePass:', e);
//        composer = null; // Fallback to standard rendering
//    }

//    controls = new THREE.OrbitControls(camera, renderer.domElement);
//    controls.enableDamping = true;
//    controls.dampingFactor = 0.1;
//    controls.screenSpacePanning = false;
//    controls.minDistance = 0.5;
//    controls.maxDistance = 8;
//    controls.autoRotate = false;
//    controls.autoRotateSpeed = 1.0;

//    // Lighting
//    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
//    scene.add(ambientLight);
//    pointLight = new THREE.PointLight(0xffffff, 1.5, 10);
//    pointLight.position.set(5, 5, 5);
//    scene.add(pointLight);
//    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
//    directionalLight.position.set(5, 5, 5);
//    scene.add(directionalLight);

//    raycaster = new THREE.Raycaster();
//    mouse = new THREE.Vector2();

//    let model;
//    const loader = new THREE.GLTFLoader();
//    let font;
//    try {
//        const fontLoader = new THREE.FontLoader();
//        fontLoader.load(
//            'https://unpkg.com/three@0.134.0/examples/fonts/helvetiker_regular.typeface.json',
//            (loadedFont) => {
//                font = loadedFont;
//                console.log('Font loaded for 3D text labels');
//            },
//            undefined,
//            (error) => {
//                console.warn('Error loading font, skipping 3D text labels:', error);
//            }
//        );
//    } catch (e) {
//        console.warn('FontLoader initialization failed:', e);
//    }

//    loader.load(
//        modelPath,
//        (gltf) => {
//            model = gltf.scene;
//            scene.add(model);
//            model.position.set(0, 0, 0);
//            const box = new THREE.Box3().setFromObject(model);
//            const size = new THREE.Vector3();
//            box.getSize(size);
//            const center = new THREE.Vector3();
//            box.getCenter(center);
//            console.log('Model size:', size, 'Center:', center);

//            // Scale model to fit within ~2 units
//            const maxDimension = Math.max(size.x, size.y, size.z);
//            if (maxDimension > 0) {
//                const scaleFactor = 2 / maxDimension;
//                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
//                console.log('Applied scale factor:', scaleFactor);
//            }

//            // Recompute bounding box after scaling
//            box.setFromObject(model);
//            box.getSize(size);
//            box.getCenter(center);

//            // Parse modelPoints
//            let parsedModelPoints = modelPoints;
//            if (typeof modelPoints === 'string') {
//                try {
//                    parsedModelPoints = JSON.parse(modelPoints);
//                } catch (e) {
//                    console.error('Error parsing modelPoints:', e);
//                    return;
//                }
//            }

//            console.log('Received modelPoints:', parsedModelPoints);

//            // Add points using raw Blender coordinates
//            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
//                parsedModelPoints.forEach((point, index) => {
//                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
//                        console.error('Invalid point data:', point);
//                        return;
//                    }

//                    // Use raw coordinates, scaled by model’s scale factor
//                    const x = point.position[0] * model.scale.x;
//                    const y = point.position[1] * model.scale.y;
//                    const z = point.position[2] * model.scale.z;
//                    const pointPosition = new THREE.Vector3(x, y, z);

//                    // Create a sphere for raycasting
//                    const sphereGeometry = new THREE.SphereGeometry(0.02, 32, 32);
//                    const sphereMaterial = new THREE.MeshBasicMaterial({
//                        color: new THREE.Color(0xffff00), // Bright yellow color
//                        //color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`),
//                        transparent: true,
//                        opacity: 0.7 // Set to 0 to make invisible
//                    });
//                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//                    sphere.position.copy(pointPosition);
//                    sphere.name = point.id;
//                    scene.add(sphere);
//                    points.push(sphere);

//                    // Add 3D text label if font is loaded
//                    if (font) {
//                        try {
//                            const textGeometry = new THREE.TextGeometry(point.id, {
//                                font: font,
//                                size: 0.05,
//                                height: 0.01
//                            });
//                            const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
//                            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
//                            textMesh.position.copy(pointPosition).add(new THREE.Vector3(0.1, 0, 0));
//                            scene.add(textMesh);
//                            sphere.userData.textLabel = textMesh;
//                        } catch (e) {
//                            console.warn('Failed to create text label for point:', point.id, e);
//                        }
//                    }

//                    // Store model for outline
//                    sphere.userData.model = model;

//                    console.log(`Point added: ${point.id} at world [${x}, ${y}, ${z}]`);
//                });
//            } else {
//                console.error('modelPoints is not a valid array:', parsedModelPoints);
//            }

//            // Adjust camera
//            camera.position.set(center.x, center.y + size.y * 1.5, center.z + size.z * 2);
//            controls.target.set(center.x, center.y, center.z);
//            controls.update();
//        },
//        (progress) => {
//            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
//        },
//        (error) => {
//            console.error('Error loading GLTF model:', error);
//        }
//    );

//    // Create tooltip element
//    const tooltip = document.createElement('div');
//    tooltip.style.position = 'absolute';
//    tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
//    tooltip.style.color = 'white';
//    tooltip.style.padding = '5px 10px';
//    tooltip.style.borderRadius = '5px';
//    tooltip.style.pointerEvents = 'none';
//    tooltip.style.display = 'none';
//    document.body.appendChild(tooltip);

//    function animate() {
//        requestAnimationFrame(animate);
//        controls.update();

//        // Handle camera zoom, light, and particle animation
//        points.forEach(point => {
//            if (point.userData.isAnimating && point.userData.cameraAnimation) {
//                const elapsed = Date.now() - point.userData.cameraAnimation.start;
//                const progress = Math.min(elapsed / point.userData.cameraAnimation.duration, 1);
//                const ease = 1 - Math.pow(1 - progress, 3);

//                camera.position.lerpVectors(
//                    point.userData.cameraAnimation.startPos,
//                    point.userData.cameraAnimation.targetPos,
//                    ease
//                );
//                controls.target.lerpVectors(
//                    point.userData.cameraAnimation.startTarget,
//                    point.userData.cameraAnimation.targetPoint,
//                    ease
//                );
//                pointLight.position.lerpVectors(
//                    point.userData.cameraAnimation.startLightPos,
//                    point.userData.cameraAnimation.targetPoint,
//                    ease
//                );
//                controls.update();

//                // Update outline effect
//                if (outlinePass) {
//                    outlinePass.selectedObjects = [point.userData.model];
//                }

//                // Handle particle animation
//                if (point.userData.particles) {
//                    const particleProgress = Math.min(elapsed / 500, 1);
//                    const particleEase = 1 - Math.pow(1 - particleProgress, 2);
//                    point.userData.particles.material.opacity = 1 - particleEase;
//                    point.userData.particles.geometry.attributes.position.array.forEach((_, i) => {
//                        if (i % 3 === 0) {
//                            const index = i / 3;
//                            point.userData.particles.geometry.attributes.position.array[i] += point.userData.particleVelocities[index].x * particleEase * 0.01;
//                            point.userData.particles.geometry.attributes.position.array[i + 1] += point.userData.particleVelocities[index].y * particleEase * 0.01;
//                            point.userData.particles.geometry.attributes.position.array[i + 2] += point.userData.particleVelocities[index].z * particleEase * 0.01;
//                        }
//                    });
//                    point.userData.particles.geometry.attributes.position.needsUpdate = true;
//                    if (particleProgress >= 1) {
//                        scene.remove(point.userData.particles);
//                        delete point.userData.particles;
//                        delete point.userData.particleVelocities;
//                    }
//                }

//                console.log(`Animating camera/light for point ${point.name}: progress=${progress.toFixed(2)}, cameraPos=[${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}]`);

//                if (progress >= 1) {
//                    point.userData.isAnimating = false;
//                    delete point.userData.cameraAnimation;
//                    if (outlinePass) {
//                        outlinePass.selectedObjects = [];
//                    }
//                    console.log(`Camera/light animation completed for point ${point.name}`);
//                }
//            }
//        });

//        if (composer) {
//            composer.render();
//        } else {
//            renderer.render(scene, camera);
//        }
//    }
//    animate();

//    window.addEventListener('resize', () => {
//        const newWidth = canvas.parentElement.offsetWidth;
//        const newHeight = canvas.parentElement.offsetHeight;
//        camera.aspect = newWidth / newHeight;
//        camera.updateProjectionMatrix();
//        renderer.setSize(newWidth, newHeight);
//        if (composer) {
//            composer.setSize(newWidth, newHeight);
//            if (outlinePass) {
//                outlinePass.setSize(newWidth, newHeight);
//            }
//        }
//    });
//    canvas.addEventListener('click', (event) => {
//        event.preventDefault();
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);

//        // Raycast against points and model
//        const intersectsPoints = raycaster.intersectObjects(points, false);
//        const intersectsModel = raycaster.intersectObject(model, true); // true for recursive check on model children

//        // Disable auto-rotation on any click
//        controls.autoRotate = false;

//        if (intersectsPoints.length > 0) {
//            // Point intersection
//            const intersection = intersectsPoints[0];
//            const pos = intersection.point;
//            const clickedPoint = intersection.object;

//            console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

//            // Reset any ongoing animations
//            points.forEach(p => {
//                p.userData.isAnimating = false;
//                delete p.userData.cameraAnimation;
//                if (p.userData.particles) {
//                    scene.remove(p.userData.particles);
//                    delete p.userData.particles;
//                    delete p.userData.particleVelocities;
//                }
//            });

//            // Start camera and light zoom animation
//            clickedPoint.userData.isAnimating = true;
//            clickedPoint.userData.cameraAnimation = {
//                start: Date.now(),
//                duration: 1000,
//                startPos: camera.position.clone(),
//                targetPos: pos.clone().add(new THREE.Vector3(0, 0, 0.5)),
//                startTarget: controls.target.clone(),
//                targetPoint: pos.clone(),
//                startLightPos: pointLight.position.clone()
//            };

//            // Add particle burst
//            const particleCount = 10;
//            const positions = new Float32Array(particleCount * 3);
//            const velocities = [];
//            for (let i = 0; i < particleCount; i++) {
//                positions[i * 3] = pos.x;
//                positions[i * 3 + 1] = pos.y;
//                positions[i * 3 + 2] = pos.z;
//                velocities.push(new THREE.Vector3(
//                    (Math.random() - 0.5) * 2,
//                    (Math.random() - 0.5) * 2,
//                    (Math.random() - 0.5) * 2
//                ).normalize());
//            }
//            const particleGeometry = new THREE.BufferGeometry();
//            particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
//            const particleMaterial = new THREE.PointsMaterial({
//                color: new THREE.Color(`hsl(${Math.random() * 360}, 70%, 50%)`),
//                size: 0.03,
//                transparent: true,
//                opacity: 1
//            });
//            const particles = new THREE.Points(particleGeometry, particleMaterial);
//            scene.add(particles);
//            clickedPoint.userData.particles = particles;
//            clickedPoint.userData.particleVelocities = velocities;

//            console.log(`Starting camera/light zoom and particle burst for point ${clickedPoint.name}`);

//            if (onClickCallback) {
//                onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
//            }
//        } else if (intersectsModel.length > 0) {
//            // Model intersection
//            const intersection = intersectsModel[0];
//            const pos = intersection.point;
//            console.log(`Clicked model at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
//        } else {
//            // No intersection: compute point along ray at fixed distance
//            const rayDirection = raycaster.ray.direction.clone();
//            const rayOrigin = raycaster.ray.origin.clone();
//            const distance = 5; // Arbitrary distance from camera
//            const pos = rayOrigin.add(rayDirection.multiplyScalar(distance));
//            console.log(`Clicked empty space at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
//        }
//    });
//    //canvas.addEventListener('click', (event) => {
//    //    event.preventDefault();
//    //    mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//    //    mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//    //    raycaster.setFromCamera(mouse, camera);
//    //    const intersects = raycaster.intersectObjects(points, false);

//    //    if (intersects.length > 0) {
//    //        const intersection = intersects[0];
//    //        const pos = intersection.point;
//    //        const clickedPoint = intersection.object;

//    //        console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

//    //        // Disable auto-rotation on click
//    //        controls.autoRotate = false;

//    //        // Reset any ongoing animations
//    //        points.forEach(p => {
//    //            p.userData.isAnimating = false;
//    //            delete p.userData.cameraAnimation;
//    //            if (p.userData.particles) {
//    //                scene.remove(p.userData.particles);
//    //                delete p.userData.particles;
//    //                delete p.userData.particleVelocities;
//    //            }
//    //        });

//    //        // Start camera and light zoom animation
//    //        clickedPoint.userData.isAnimating = true;
//    //        clickedPoint.userData.cameraAnimation = {
//    //            start: Date.now(),
//    //            duration: 1000,
//    //            startPos: camera.position.clone(),
//    //            targetPos: pos.clone().add(new THREE.Vector3(0, 0, 0.5)),
//    //            startTarget: controls.target.clone(),
//    //            targetPoint: pos.clone(),
//    //            startLightPos: pointLight.position.clone()
//    //        };

//    //        // Add particle burst
//    //        const particleCount = 10;
//    //        const positions = new Float32Array(particleCount * 3);
//    //        const velocities = [];
//    //        for (let i = 0; i < particleCount; i++) {
//    //            positions[i * 3] = pos.x;
//    //            positions[i * 3 + 1] = pos.y;
//    //            positions[i * 3 + 2] = pos.z;
//    //            velocities.push(new THREE.Vector3(
//    //                (Math.random() - 0.5) * 2,
//    //                (Math.random() - 0.5) * 2,
//    //                (Math.random() - 0.5) * 2
//    //            ).normalize());
//    //        }
//    //        const particleGeometry = new THREE.BufferGeometry();
//    //        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
//    //        const particleMaterial = new THREE.PointsMaterial({
//    //            color: new THREE.Color(`hsl(${Math.random() * 360}, 70%, 50%)`),
//    //            size: 0.03,
//    //            transparent: true,
//    //            opacity: 1
//    //        });
//    //        const particles = new THREE.Points(particleGeometry, particleMaterial);
//    //        scene.add(particles);
//    //        clickedPoint.userData.particles = particles;
//    //        clickedPoint.userData.particleVelocities = velocities;

//    //        console.log(`Starting camera/light zoom and particle burst for point ${clickedPoint.name}`);

//    //        if (onClickCallback) {
//    //            onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
//    //        }
//    //    } else {
//    //        console.log('No intersection detected.');
//    //    }
//    //});

//    canvas.addEventListener('mousemove', (event) => {
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        // Reset scale and hide tooltip
//        points.forEach(point => {
//            if (point.userData.textLabel) {
//                point.userData.textLabel.scale.set(1, 1, 1);
//            }
//        });
//        tooltip.style.display = 'none';

//        if (intersects.length > 0) {
//            const hoveredPoint = intersects[0].object;
//            if (!hoveredPoint.userData.isAnimating) {
//                if (hoveredPoint.userData.textLabel) {
//                    hoveredPoint.userData.textLabel.scale.set(1.5, 1.5, 1.5);
//                }
//                // Show tooltip
//                tooltip.style.display = 'block';
//                tooltip.innerText = hoveredPoint.name;
//                tooltip.style.left = `${event.clientX + 10}px`;
//                tooltip.style.top = `${event.clientY + 10}px`;
//            }
//        }
//    });

//    // Gradient background function
//    function createGradientBackground() {
//        const canvas = document.createElement('canvas');
//        canvas.width = 512;
//        canvas.height = 512;
//        const ctx = canvas.getContext('2d');
//        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
//        gradient.addColorStop(0, '#1a1a3d');
//        gradient.addColorStop(1, '#4b0082');
//        ctx.fillStyle = gradient;
//        ctx.fillRect(0, 0, 512, 512);
//        return new THREE.CanvasTexture(canvas);
//    }
//};

//// Toggle auto-rotation
//window.toggleAutoRotate = (enable) => {
//    if (controls) {
//        controls.autoRotate = enable;
//        console.log(`Auto-rotation ${enable ? 'enabled' : 'disabled'}`);
//    }
//};

//window.registerClickCallback = (dotNetObject) => {
//    onClickCallback = dotNetObject;
//};




///Glow Effect, 3d camera zoom to point with outline and hover effect
//let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls, composer, outlinePass, pointLight;

//window.initThreeJs = (canvasId, modelPath, modelPoints) => {
//    const canvas = document.getElementById(canvasId);
//    console.log('Model path:', modelPath);
//    console.log('Model points:', modelPoints);
//    if (!canvas) {
//        console.error('Canvas element not found:', canvasId);
//        return;
//    }
//    const width = canvas.parentElement.offsetWidth;
//    const height = canvas.parentElement.offsetHeight;

//    scene = new THREE.Scene();

//    // Set gradient background
//    scene.background = createGradientBackground();

//    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
//    camera.position.set(0, 1.5, 3);

//    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
//    renderer.setSize(width, height);
//    renderer.shadowMap.enabled = false;

//    // Set up post-processing for outline effect
//    try {
//        composer = new THREE.EffectComposer(renderer);
//        const renderPass = new THREE.RenderPass(scene, camera);
//        composer.addPass(renderPass);
//        outlinePass = new THREE.OutlinePass(new THREE.Vector2(width, height), scene, camera);
//        outlinePass.edgeStrength = 3.0;
//        outlinePass.edgeGlow = 0.5;
//        outlinePass.edgeThickness = 1.0;
//        outlinePass.visibleEdgeColor.set(0xffff00); // Yellow outline
//        composer.addPass(outlinePass);
//    } catch (e) {
//        console.warn('Failed to initialize OutlinePass:', e);
//        composer = null; // Fallback to standard rendering
//    }

//    controls = new THREE.OrbitControls(camera, renderer.domElement);
//    controls.enableDamping = true;
//    controls.dampingFactor = 0.1;
//    controls.screenSpacePanning = false;
//    controls.minDistance = 0.5;
//    controls.maxDistance = 8;

//    // Lighting
//    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
//    scene.add(ambientLight);
//    pointLight = new THREE.PointLight(0xffffff, 1.5, 10);
//    pointLight.position.set(5, 5, 5);
//    scene.add(pointLight);
//    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
//    directionalLight.position.set(5, 5, 5);
//    scene.add(directionalLight);

//    raycaster = new THREE.Raycaster();
//    mouse = new THREE.Vector2();

//    // Create glow texture for points
//    const glowTexture = createGlowTexture();
//    let model; // Store model for reference
//    const loader = new THREE.GLTFLoader();
//    const fontLoader = new THREE.FontLoader();
//    let font; // Store loaded font for 3D text

//    // Load font for 3D text labels
//    fontLoader.load(
//        'https://unpkg.com/three@0.134.0/examples/fonts/helvetiker_regular.typeface.json',
//        (loadedFont) => {
//            font = loadedFont;
//            console.log('Font loaded for 3D text labels');
//        },
//        undefined,
//        (error) => {
//            console.error('Error loading font:', error);
//        }
//    );

//    loader.load(
//        modelPath,
//        (gltf) => {
//            model = gltf.scene;
//            scene.add(model);
//            model.position.set(0, 0, 0);

//            // Compute bounding box for camera positioning
//            const box = new THREE.Box3().setFromObject(model);
//            const size = new THREE.Vector3();
//            box.getSize(size);
//            const center = new THREE.Vector3();
//            box.getCenter(center);
//            console.log('Model size:', size, 'Center:', center);

//            // Scale model to fit within ~2 units
//            const maxDimension = Math.max(size.x, size.y, size.z);
//            if (maxDimension > 0) {
//                const scaleFactor = 2 / maxDimension;
//                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
//                console.log('Applied scale factor:', scaleFactor);
//            }

//            // Recompute bounding box after scaling
//            box.setFromObject(model);
//            box.getSize(size);
//            box.getCenter(center);

//            // Parse modelPoints
//            let parsedModelPoints = modelPoints;
//            if (typeof modelPoints === 'string') {
//                try {
//                    parsedModelPoints = JSON.parse(modelPoints);
//                } catch (e) {
//                    console.error('Error parsing modelPoints:', e);
//                    return;
//                }
//            }

//            console.log('Received modelPoints:', parsedModelPoints);

//            // Add points using raw Blender coordinates
//            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
//                parsedModelPoints.forEach((point, index) => {
//                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
//                        console.error('Invalid point data:', point);
//                        return;
//                    }

//                    // Use raw coordinates, scaled by model’s scale factor
//                    const x = point.position[0] * model.scale.x;
//                    const y = point.position[1] * model.scale.y;
//                    const z = point.position[2] * model.scale.z;
//                    const pointPosition = new THREE.Vector3(x, y, z);

//                    // Create a sphere for raycasting
//                    const sphereGeometry = new THREE.SphereGeometry(0.01, 32, 32);
//                    const sphereMaterial = new THREE.MeshBasicMaterial({
//                        color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`),
//                        transparent: true,
//                        opacity: 0.7
//                    });
//                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//                    sphere.position.copy(pointPosition);
//                    sphere.name = point.id;
//                    scene.add(sphere);
//                    points.push(sphere);

//                    // Create glow sprite
//                    const sprite = new THREE.Sprite(
//                        new THREE.SpriteMaterial({
//                            map: glowTexture,
//                            color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`),
//                            transparent: true,
//                            blending: THREE.AdditiveBlending,
//                            opacity: 0.5
//                        })
//                    );
//                    sprite.position.copy(pointPosition);
//                    sprite.scale.set(0.2, 0.2, 0.2);
//                    scene.add(sprite);
//                    sphere.userData.glowSprite = sprite;

//                    // Add 3D text label
//                    if (font) {
//                        const textGeometry = new THREE.TextGeometry(point.id, {
//                            font: font,
//                            size: 0.05,
//                            height: 0.01
//                        });
//                        const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
//                        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
//                        textMesh.position.copy(pointPosition).add(new THREE.Vector3(0.1, 0, 0)); // Offset slightly
//                        scene.add(textMesh);
//                        sphere.userData.textLabel = textMesh;
//                    }

//                    // Store model for outline
//                    sphere.userData.model = model;

//                    console.log(`Point added: ${point.id} at world [${x}, ${y}, ${z}]`);
//                });
//            } else {
//                console.error('modelPoints is not a valid array:', parsedModelPoints);
//            }

//            // Adjust camera
//            camera.position.set(center.x, center.y + size.y * 1.5, center.z + size.z * 2);
//            controls.target.set(center.x, center.y, center.z);
//            controls.update();
//        },
//        (progress) => {
//            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
//        },
//        (error) => {
//            console.error('Error loading GLTF model:', error);
//        }
//    );

//    // Create tooltip element
//    const tooltip = document.createElement('div');
//    tooltip.style.position = 'absolute';
//    tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
//    tooltip.style.color = 'white';
//    tooltip.style.padding = '5px 10px';
//    tooltip.style.borderRadius = '5px';
//    tooltip.style.pointerEvents = 'none';
//    tooltip.style.display = 'none';
//    document.body.appendChild(tooltip);

//    function animate() {
//        requestAnimationFrame(animate);
//        controls.update();

//        // Handle camera zoom, light, and particle animation
//        points.forEach(point => {
//            if (point.userData.isAnimating && point.userData.cameraAnimation) {
//                const elapsed = Date.now() - point.userData.cameraAnimation.start;
//                const progress = Math.min(elapsed / point.userData.cameraAnimation.duration, 1);
//                const ease = 1 - Math.pow(1 - progress, 3);

//                camera.position.lerpVectors(
//                    point.userData.cameraAnimation.startPos,
//                    point.userData.cameraAnimation.targetPos,
//                    ease
//                );
//                controls.target.lerpVectors(
//                    point.userData.cameraAnimation.startTarget,
//                    point.userData.cameraAnimation.targetPoint,
//                    ease
//                );
//                pointLight.position.lerpVectors(
//                    point.userData.cameraAnimation.startLightPos,
//                    point.userData.cameraAnimation.targetPoint,
//                    ease
//                );
//                controls.update();

//                // Update outline effect
//                if (outlinePass) {
//                    outlinePass.selectedObjects = [point.userData.model];
//                }

//                // Handle particle animation
//                if (point.userData.particles) {
//                    const particleProgress = Math.min(elapsed / 500, 1);
//                    const particleEase = 1 - Math.pow(1 - particleProgress, 2);
//                    point.userData.particles.material.opacity = 1 - particleEase;
//                    point.userData.particles.geometry.attributes.position.array.forEach((_, i) => {
//                        if (i % 3 === 0) {
//                            const index = i / 3;
//                            point.userData.particles.geometry.attributes.position.array[i] += point.userData.particleVelocities[index].x * particleEase * 0.01;
//                            point.userData.particles.geometry.attributes.position.array[i + 1] += point.userData.particleVelocities[index].y * particleEase * 0.01;
//                            point.userData.particles.geometry.attributes.position.array[i + 2] += point.userData.particleVelocities[index].z * particleEase * 0.01;
//                        }
//                    });
//                    point.userData.particles.geometry.attributes.position.needsUpdate = true;
//                    if (particleProgress >= 1) {
//                        scene.remove(point.userData.particles);
//                        delete point.userData.particles;
//                        delete point.userData.particleVelocities;
//                    }
//                }

//                console.log(`Animating camera/light for point ${point.name}: progress=${progress.toFixed(2)}, cameraPos=[${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}]`);

//                if (progress >= 1) {
//                    point.userData.isAnimating = false;
//                    delete point.userData.cameraAnimation;
//                    if (outlinePass) {
//                        outlinePass.selectedObjects = [];
//                    }
//                    console.log(`Camera/light animation completed for point ${point.name}`);
//                }
//            }
//        });

//        if (composer) {
//            composer.render();
//        } else {
//            renderer.render(scene, camera);
//        }
//    }
//    animate();

//    window.addEventListener('resize', () => {
//        const newWidth = canvas.parentElement.offsetWidth;
//        const newHeight = canvas.parentElement.offsetHeight;
//        camera.aspect = newWidth / newHeight;
//        camera.updateProjectionMatrix();
//        renderer.setSize(newWidth, newHeight);
//        if (composer) {
//            composer.setSize(newWidth, newHeight);
//            if (outlinePass) {
//                outlinePass.setSize(newWidth, newHeight);
//            }
//        }
//    });

//    canvas.addEventListener('click', (event) => {
//        event.preventDefault();
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        if (intersects.length > 0) {
//            const intersection = intersects[0];
//            const pos = intersection.point;
//            const clickedPoint = intersection.object;

//            console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

//            // Reset any ongoing animations
//            points.forEach(p => {
//                p.userData.isAnimating = false;
//                delete p.userData.cameraAnimation;
//                if (p.userData.particles) {
//                    scene.remove(p.userData.particles);
//                    delete p.userData.particles;
//                    delete p.userData.particleVelocities;
//                }
//            });

//            // Start camera and light zoom animation
//            clickedPoint.userData.isAnimating = true;
//            clickedPoint.userData.cameraAnimation = {
//                start: Date.now(),
//                duration: 1000,
//                startPos: camera.position.clone(),
//                targetPos: pos.clone().add(new THREE.Vector3(0, 0, 0.5)),
//                startTarget: controls.target.clone(),
//                targetPoint: pos.clone(),
//                startLightPos: pointLight.position.clone()
//            };

//            // Add particle burst
//            const particleCount = 10;
//            const positions = new Float32Array(particleCount * 3);
//            const velocities = [];
//            for (let i = 0; i < particleCount; i++) {
//                positions[i * 3] = pos.x;
//                positions[i * 3 + 1] = pos.y;
//                positions[i * 3 + 2] = pos.z;
//                velocities.push(new THREE.Vector3(
//                    (Math.random() - 0.5) * 2,
//                    (Math.random() - 0.5) * 2,
//                    (Math.random() - 0.5) * 2
//                ).normalize());
//            }
//            const particleGeometry = new THREE.BufferGeometry();
//            particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
//            const particleMaterial = new THREE.PointsMaterial({
//                color: new THREE.Color(`hsl(${Math.random() * 360}, 70%, 50%)`),
//                size: 0.03,
//                transparent: true,
//                opacity: 1
//            });
//            const particles = new THREE.Points(particleGeometry, particleMaterial);
//            scene.add(particles);
//            clickedPoint.userData.particles = particles;
//            clickedPoint.userData.particleVelocities = velocities;

//            console.log(`Starting camera/light zoom and particle burst for point ${clickedPoint.name}`);

//            if (onClickCallback) {
//                onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
//            }
//        } else {
//            console.log('No intersection detected.');
//        }
//    });

//    canvas.addEventListener('mousemove', (event) => {
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        // Reset scale and hide tooltip
//        points.forEach(point => {
//            point.scale.set(1, 1, 1);
//            if (point.userData.glowSprite) {
//                point.userData.glowSprite.scale.set(0.2, 0.2, 0.2);
//            }
//        });
//        tooltip.style.display = 'none';

//        if (intersects.length > 0) {
//            const hoveredPoint = intersects[0].object;
//            if (!hoveredPoint.userData.isAnimating) {
//                hoveredPoint.scale.set(1.5, 1.5, 1.5);
//                if (hoveredPoint.userData.glowSprite) {
//                    hoveredPoint.userData.glowSprite.scale.set(0.3, 0.3, 0.3);
//                }
//                // Show tooltip
//                tooltip.style.display = 'block';
//                tooltip.innerText = hoveredPoint.name;
//                tooltip.style.left = `${event.clientX + 10}px`;
//                tooltip.style.top = `${event.clientY + 10}px`;
//            }
//        }
//    });

//    // Glow texture function
//    function createGlowTexture() {
//        const canvas = document.createElement('canvas');
//        canvas.width = 64;
//        canvas.height = 64;
//        const ctx = canvas.getContext('2d');
//        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
//        gradient.addColorStop(0, 'white');
//        gradient.addColorStop(0.2, 'white');
//        gradient.addColorStop(1, 'transparent');
//        ctx.fillStyle = gradient;
//        ctx.fillRect(0, 0, 64, 64);
//        return new THREE.CanvasTexture(canvas);
//    }

//    // Gradient background function
//    function createGradientBackground() {
//        const canvas = document.createElement('canvas');
//        canvas.width = 512;
//        canvas.height = 512;
//        const ctx = canvas.getContext('2d');
//        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
//        gradient.addColorStop(0, '#1a1a3d');
//        gradient.addColorStop(1, '#4b0082');
//        ctx.fillStyle = gradient;
//        ctx.fillRect(0, 0, 512, 512);
//        return new THREE.CanvasTexture(canvas);
//    }
//};

//window.registerClickCallback = (dotNetObject) => {
//    onClickCallback = dotNetObject;
//};



////3d camera zoom to point with outline and hover effect
//let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls;

//window.initThreeJs = (canvasId, modelPath, modelPoints) => {
//    const canvas = document.getElementById(canvasId);
//    console.log('Model path:', modelPath);
//    console.log('Model points:', modelPoints);
//    if (!canvas) {
//        console.error('Canvas element not found:', canvasId);
//        return;
//    }
//    const width = canvas.parentElement.offsetWidth;
//    const height = canvas.parentElement.offsetHeight;

//    scene = new THREE.Scene();
//    scene.background = new THREE.Color(0xcccccc);

//    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
//    camera.position.set(0, 1.5, 3);

//    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
//    renderer.setSize(width, height);
//    renderer.shadowMap.enabled = false;

//    controls = new THREE.OrbitControls(camera, renderer.domElement);
//    controls.enableDamping = true;
//    controls.dampingFactor = 0.05;
//    controls.screenSpacePanning = false;
//    controls.minDistance = 1;
//    controls.maxDistance = 10;

//    // Lighting for outline visibility
//    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
//    scene.add(ambientLight);
//    const pointLight = new THREE.PointLight(0xffffff, 1.5, 10);
//    pointLight.position.set(5, 5, 5);
//    scene.add(pointLight);
//    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
//    directionalLight.position.set(5, 5, 5);
//    directionalLight.castShadow = false;
//    scene.add(directionalLight);

//    raycaster = new THREE.Raycaster();
//    mouse = new THREE.Vector2();

//    let model; // Store model for reference
//    const loader = new THREE.GLTFLoader();
//    loader.load(
//        modelPath,
//        (gltf) => {
//            model = gltf.scene;
//            scene.add(model);
//            model.position.set(0, 0, 0);

//            // Compute bounding box for camera positioning
//            const box = new THREE.Box3().setFromObject(model);
//            const size = new THREE.Vector3();
//            box.getSize(size);
//            const center = new THREE.Vector3();
//            box.getCenter(center);
//            console.log('Model size:', size, 'Center:', center);

//            // Scale model to fit within ~2 units
//            const maxDimension = Math.max(size.x, size.y, size.z);
//            if (maxDimension > 0) {
//                const scaleFactor = 2 / maxDimension;
//                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
//                console.log('Applied scale factor:', scaleFactor);
//            }

//            // Recompute bounding box after scaling
//            box.setFromObject(model);
//            box.getSize(size);
//            box.getCenter(center);

//            // Parse modelPoints
//            let parsedModelPoints = modelPoints;
//            if (typeof modelPoints === 'string') {
//                try {
//                    parsedModelPoints = JSON.parse(modelPoints);
//                } catch (e) {
//                    console.error('Error parsing modelPoints:', e);
//                    return;
//                }
//            }

//            console.log('Received modelPoints:', parsedModelPoints);

//            // Add points using raw Blender coordinates
//            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
//                parsedModelPoints.forEach((point, index) => {
//                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
//                        console.error('Invalid point data:', point);
//                        return;
//                    }

//                    // Use raw coordinates, scaled by model’s scale factor
//                    const x = point.position[0] * model.scale.x;
//                    const y = point.position[1] * model.scale.y;
//                    const z = point.position[2] * model.scale.z;
//                    const pointPosition = new THREE.Vector3(x, y, z);

//                    // Create a sphere for raycasting
//                    const sphereGeometry = new THREE.SphereGeometry(0.01, 32, 32); // Larger for clicking
//                    const sphereMaterial = new THREE.MeshBasicMaterial({
//                        color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`),
//                        transparent: true,
//                        opacity: 0.7 // Visible for debugging
//                    });
//                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//                    sphere.position.copy(pointPosition);
//                    sphere.name = point.id;
//                    scene.add(sphere);
//                    points.push(sphere);

//                    // Create thick outline
//                    const edgesGeometry = new THREE.EdgesGeometry(sphereGeometry);
//                    const lineMaterial = new THREE.LineBasicMaterial({
//                        color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`),
//                        linewidth: 3
//                    });
//                    const outline = new THREE.LineSegments(edgesGeometry, lineMaterial);
//                    outline.position.copy(pointPosition);
//                    scene.add(outline);

//                    // Store outline and initialize animation data
//                    sphere.userData.outline = outline;
//                    sphere.userData.isAnimating = false;

//                    console.log(`Point added: ${point.id} at world [${x}, ${y}, ${z}]`);
//                });
//            } else {
//                console.error('modelPoints is not a valid array:', parsedModelPoints);
//            }

//            // Adjust camera
//            camera.position.set(center.x, center.y + size.y * 1.5, center.z + size.z * 2);
//            controls.target.set(center.x, center.y, center.z);
//            controls.update();
//        },
//        (progress) => {
//            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
//        },
//        (error) => {
//            console.error('Error loading GLTF model:', error);
//        }
//    );

//    function animate() {
//        requestAnimationFrame(animate);
//        controls.update();

//        // Handle camera zoom animation for clicked points
//        points.forEach(point => {
//            if (point.userData.isAnimating && point.userData.cameraAnimation) {
//                const elapsed = Date.now() - point.userData.cameraAnimation.start;
//                const progress = Math.min(elapsed / point.userData.cameraAnimation.duration, 1);
//                const ease = 1 - Math.pow(1 - progress, 3); // Ease-out effect

//                camera.position.lerpVectors(
//                    point.userData.cameraAnimation.startPos,
//                    point.userData.cameraAnimation.targetPos,
//                    ease
//                );
//                controls.target.lerpVectors(
//                    point.userData.cameraAnimation.startTarget,
//                    point.userData.cameraAnimation.targetPoint,
//                    ease
//                );
//                controls.update();

//                console.log(`Animating camera for point ${point.name}: progress=${progress.toFixed(2)}, cameraPos=[${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}]`);

//                // Stop animation when complete
//                if (progress >= 1) {
//                    point.userData.isAnimating = false;
//                    delete point.userData.cameraAnimation;
//                    console.log(`Camera animation completed for point ${point.name}`);
//                }
//            }
//        });

//        renderer.render(scene, camera);
//    }
//    animate();

//    window.addEventListener('resize', () => {
//        const newWidth = canvas.parentElement.offsetWidth;
//        const newHeight = canvas.parentElement.offsetHeight;
//        camera.aspect = newWidth / newHeight;
//        camera.updateProjectionMatrix();
//        renderer.setSize(newWidth, newHeight);
//    });

//    canvas.addEventListener('click', (event) => {
//        event.preventDefault();
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        if (intersects.length > 0) {
//            const intersection = intersects[0];
//            const pos = intersection.point;
//            const clickedPoint = intersection.object;

//            console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

//            // Reset any ongoing animations
//            points.forEach(p => {
//                p.userData.isAnimating = false;
//                delete p.userData.cameraAnimation;
//            });

//            // Start camera zoom animation
//            clickedPoint.userData.isAnimating = true;
//            clickedPoint.userData.cameraAnimation = {
//                start: Date.now(),
//                duration: 1000, // 1 second
//                startPos: camera.position.clone(),
//                targetPos: pos.clone().add(new THREE.Vector3(0, 0, 1)), // 1 unit away from point
//                startTarget: controls.target.clone(),
//                targetPoint: pos.clone()
//            };

//            console.log(`Starting camera zoom for point ${clickedPoint.name}`);

//            if (onClickCallback) {
//                onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
//            }
//        } else {
//            console.log('No intersection detected.');
//        }
//    });

//    canvas.addEventListener('mousemove', (event) => {
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        // Reset scale for non-animating points
//        points.forEach(point => {
//            point.scale.set(1, 1, 1);
//            if (point.userData.outline) {
//                point.userData.outline.scale.set(1, 1, 1);
//            }
//        });

//        if (intersects.length > 0) {
//            const hoveredPoint = intersects[0].object;
//            if (!hoveredPoint.userData.isAnimating) {
//                hoveredPoint.scale.set(1.5, 1.5, 1.5);
//                if (hoveredPoint.userData.outline) {
//                    hoveredPoint.userData.outline.scale.set(1.5, 1.5, 1.5);
//                }
//                console.log(`Hovering point ${hoveredPoint.name}`);
//            }
//        }
//    });
//};

//window.registerClickCallback = (dotNetObject) => {
//    onClickCallback = dotNetObject;
//};






//let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls;

//window.initThreeJs = (canvasId, modelPath, modelPoints) => {
//    const canvas = document.getElementById(canvasId);
//    console.log('Model path:', modelPath);
//    console.log('Model points:', modelPoints);
//    if (!canvas) {
//        console.error('Canvas element not found:', canvasId);
//        return;
//    }
//    const width = canvas.parentElement.offsetWidth;
//    const height = canvas.parentElement.offsetHeight;

//    scene = new THREE.Scene();
//    scene.background = new THREE.Color(0xcccccc);

//    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
//    camera.position.set(0, 1.5, 3);

//    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
//    renderer.setSize(width, height);
//    renderer.shadowMap.enabled = false;

//    controls = new THREE.OrbitControls(camera, renderer.domElement);
//    controls.enableDamping = true;
//    controls.dampingFactor = 0.05;
//    controls.screenSpacePanning = false;
//    controls.minDistance = 1;
//    controls.maxDistance = 10;

//    // Lighting for outline visibility
//    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
//    scene.add(ambientLight);
//    const pointLight = new THREE.PointLight(0xffffff, 1.5, 10);
//    pointLight.position.set(5, 5, 5);
//    scene.add(pointLight);
//    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
//    directionalLight.position.set(5, 5, 5);
//    directionalLight.castShadow = false;
//    scene.add(directionalLight);

//    raycaster = new THREE.Raycaster();
//    mouse = new THREE.Vector2();

//    const loader = new THREE.GLTFLoader();
//    loader.load(
//        modelPath,
//        (gltf) => {
//            const model = gltf.scene;
//            scene.add(model);
//            model.position.set(0, 0, 0);

//            // Compute bounding box for camera positioning
//            const box = new THREE.Box3().setFromObject(model);
//            const size = new THREE.Vector3();
//            box.getSize(size);
//            const center = new THREE.Vector3();
//            box.getCenter(center);
//            console.log('Model size:', size, 'Center:', center);

//            // Scale model to fit within ~2 units
//            const maxDimension = Math.max(size.x, size.y, size.z);
//            if (maxDimension > 0) {
//                const scaleFactor = 2 / maxDimension;
//                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
//                console.log('Applied scale factor:', scaleFactor);
//            }

//            // Recompute bounding box after scaling
//            box.setFromObject(model);
//            box.getSize(size);
//            box.getCenter(center);

//            // Parse modelPoints
//            let parsedModelPoints = modelPoints;
//            if (typeof modelPoints === 'string') {
//                try {
//                    parsedModelPoints = JSON.parse(modelPoints);
//                } catch (e) {
//                    console.error('Error parsing modelPoints:', e);
//                    return;
//                }
//            }

//            console.log('Received modelPoints:', parsedModelPoints);

//            // Add points using raw Blender coordinates
//            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
//                parsedModelPoints.forEach((point, index) => {
//                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
//                        console.error('Invalid point data:', point);
//                        return;
//                    }

//                    // Use raw coordinates, scaled by model’s scale factor
//                    const x = point.position[0] * model.scale.x;
//                    const y = point.position[1] * model.scale.y;
//                    const z = point.position[2] * model.scale.z;
//                    const pointPosition = new THREE.Vector3(x, y, z);

//                    // Create a small sphere for raycasting (invisible)
//                    const sphereGeometry = new THREE.SphereGeometry(0.01, 32, 32); // Smaller sphere
//                    const sphereMaterial = new THREE.MeshBasicMaterial({
//                        transparent: true,
//                        opacity: 0 // Fully transparent for raycasting only
//                    });
//                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//                    sphere.position.copy(pointPosition);
//                    sphere.name = point.id;
//                    scene.add(sphere);
//                    points.push(sphere);

//                    // Create thick outline using EdgesGeometry and LineSegments
//                    const edgesGeometry = new THREE.EdgesGeometry(sphereGeometry);
//                    const lineMaterial = new THREE.LineBasicMaterial({
//                        color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`), // Vibrant color
//                        linewidth: 2 // Thicker outline
//                    });
//                    const outline = new THREE.LineSegments(edgesGeometry, lineMaterial);
//                    outline.position.copy(pointPosition);
//                    scene.add(outline);

//                    // Store outline for scaling on hover
//                    sphere.userData.outline = outline;

//                    console.log(`Point added: ${point.id} at world [${x}, ${y}, ${z}]`);
//                });
//            } else {
//                console.error('modelPoints is not a valid array:', parsedModelPoints);
//            }

//            // Adjust camera
//            camera.position.set(center.x, center.y + size.y * 1.5, center.z + size.z * 2);
//            controls.target.set(center.x, center.y, center.z);
//            controls.update();
//        },
//        (progress) => {
//            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
//        },
//        (error) => {
//            console.error('Error loading GLTF model:', error);
//        }
//    );

//    function animate() {
//        requestAnimationFrame(animate);
//        controls.update();
//        renderer.render(scene, camera);
//    }
//    animate();

//    window.addEventListener('resize', () => {
//        const newWidth = canvas.parentElement.offsetWidth;
//        const newHeight = canvas.parentElement.offsetHeight;
//        camera.aspect = newWidth / newHeight;
//        camera.updateProjectionMatrix();
//        renderer.setSize(newWidth, newHeight);
//    });

//    canvas.addEventListener('click', (event) => {
//        event.preventDefault();
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        if (intersects.length > 0) {
//            const intersection = intersects[0];
//            const pos = intersection.point;
//            const clickedPoint = intersection.object;

//            console.log(`Clicked coordinates: x=${pos.x}, y=${pos.y}, z=${pos.z}`);

//            // Start zoom animation
//            clickedPoint.userData.isAnimating = true;
//            clickedPoint.userData.animationStart = Date.now();
//            clickedPoint.userData.animationDuration = 500; // 500ms for animation
//            clickedPoint.userData.targetScale = 2; // Scale to 2x size
//            console.log(`Clicked coordinates: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
//            if (onClickCallback) {
//                onClickCallback.invokeMethodAsync('OnPointClicked', intersection.object.name);
//            }
//        } else {
//            console.log('No intersection detected.');
//        }
//    });

//    canvas.addEventListener('mousemove', (event) => {
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        // Reset scale for all points and their outlines
//        points.forEach(point => {
//            point.scale.set(1, 1, 1);
//            if (point.userData.outline) {
//                point.userData.outline.scale.set(1, 1, 1);
//            }
//        });

//        if (intersects.length > 0) {
//            const hoveredPoint = intersects[0].object;
//            hoveredPoint.scale.set(1.5, 1.5, 1.5);
//            if (hoveredPoint.userData.outline) {
//                hoveredPoint.userData.outline.scale.set(1.5, 1.5, 1.5); // Scale outline on hover
//            }
//        }
//    });
//};

//window.registerClickCallback = (dotNetObject) => {
//    onClickCallback = dotNetObject;
//};


//let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls;

//window.initThreeJs = (canvasId, modelPath, modelPoints) => {
//    const canvas = document.getElementById(canvasId);
//    console.log('Model path:', modelPath);
//    console.log('Model points:', modelPoints);
//    if (!canvas) {
//        console.error('Canvas element not found:', canvasId);
//        return;
//    }
//    const width = canvas.parentElement.offsetWidth;
//    const height = canvas.parentElement.offsetHeight;

//    scene = new THREE.Scene();
//    scene.background = new THREE.Color(0xcccccc);

//    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
//    camera.position.set(0, 1.5, 3);

//    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
//    renderer.setSize(width, height);
//    renderer.shadowMap.enabled = false;
//    controls = new THREE.OrbitControls(camera, renderer.domElement);
//    controls.enableDamping = true;
//    controls.dampingFactor = 0.05;
//    controls.screenSpacePanning = false;
//    controls.minDistance = 1;
//    controls.maxDistance = 10;

//    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
//    scene.add(ambientLight);
//    const pointLight = new THREE.PointLight(0xffffff, 1);
//    pointLight.position.set(5, 5, 5);
//    scene.add(pointLight);
//    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
//    directionalLight.position.set(5, 5, 5);
//    directionalLight.castShadow = false;
//    scene.add(directionalLight);
//    raycaster = new THREE.Raycaster();
//    mouse = new THREE.Vector2();

//    const loader = new THREE.GLTFLoader();
//    loader.load(
//        modelPath,
//        (gltf) => {
//            const model = gltf.scene;
//            scene.add(model);
//            model.position.set(0, 0, 0);

//            // Compute bounding box for camera positioning
//            const box = new THREE.Box3().setFromObject(model);
//            const size = new THREE.Vector3();
//            box.getSize(size);
//            const center = new THREE.Vector3();
//            box.getCenter(center);
//            console.log('Model size:', size, 'Center:', center);

//            // Scale model to fit within ~2 units
//            const maxDimension = Math.max(size.x, size.y, size.z);
//            if (maxDimension > 0) {
//                const scaleFactor = 2 / maxDimension; // Adjusted for smaller model
//                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
//                console.log('Applied scale factor:', scaleFactor);
//            }

//            // Recompute bounding box after scaling
//            box.setFromObject(model);
//            box.getSize(size);
//            box.getCenter(center);

//            // Parse modelPoints
//            let parsedModelPoints = modelPoints;
//            if (typeof modelPoints === 'string') {
//                try {
//                    parsedModelPoints = JSON.parse(modelPoints);
//                } catch (e) {
//                    console.error('Error parsing modelPoints:', e);
//                    return;
//                }
//            }

//            console.log('Received modelPoints:', parsedModelPoints);

//            // Add points using raw Blender coordinates
//            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
//                parsedModelPoints.forEach((point, index) => {
//                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
//                        console.error('Invalid point data:', point);
//                        return;
//                    }

//                    // Use raw coordinates directly (apply model’s scale factor to match)
//                    const x = point.position[0] * model.scale.x;
//                    const y = point.position[1] * model.scale.y;
//                    const z = point.position[2] * model.scale.z;
//                    const pointPosition = new THREE.Vector3(x, y, z);

//                    // Create sphere for the point
//                    const sphereGeometry = new THREE.SphereGeometry(0.05, 16, 16);
//                    const sphereMaterial = new THREE.MeshBasicMaterial({
//                        color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`)
//                    });
//                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//                    sphere.position.copy(pointPosition);
//                    sphere.name = point.id;
//                    scene.add(sphere);
//                    points.push(sphere);
//                    console.log(`Point added: ${point.id} at world [${x}, ${y}, ${z}]`);

//                    // Create line pointing to the point
//                    const lineLength = 0.5;
//                    const direction = new THREE.Vector3()
//                        .subVectors(pointPosition, center)
//                        .normalize();
//                    const lineStart = pointPosition
//                        .clone()
//                        .add(direction.clone().multiplyScalar(-lineLength));
//                    const lineColor = new THREE.Color(`hsl(${index * 60}, 70%, 70%)`);

//                    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
//                        lineStart,
//                        pointPosition
//                    ]);
//                    const lineMaterial = new THREE.LineBasicMaterial({
//                        color: lineColor,
//                        linewidth: 2
//                    });
//                    const line = new THREE.Line(lineGeometry, lineMaterial);
//                    scene.add(line);
//                });
//            } else {
//                console.error('modelPoints is not a valid array:', parsedModelPoints);
//            }

//            // Adjust camera
//            camera.position.set(center.x, center.y + size.y * 1.5, center.z + size.z * 2);
//            controls.target.set(center.x, center.y, center.z);
//            controls.update();
//        },
//        (progress) => {
//            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
//        },
//        (error) => {
//            console.error('Error loading GLTF model:', error);
//        }
//    );

//    function animate() {
//        requestAnimationFrame(animate);
//        controls.update();
//        renderer.render(scene, camera);
//    }
//    animate();

//    window.addEventListener('resize', () => {
//        const newWidth = canvas.parentElement.offsetWidth;
//        const newHeight = canvas.parentElement.offsetHeight;
//        camera.aspect = newWidth / newHeight;
//        camera.updateProjectionMatrix();
//        renderer.setSize(newWidth, newHeight);
//    });

//    canvas.addEventListener('click', (event) => {
//        event.preventDefault();
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        if (intersects.length > 0) {
//            const intersection = intersects[0];
//            const pos = intersection.point;
//            console.log(`Clicked coordinates: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
//            if (onClickCallback) {
//                onClickCallback.invokeMethodAsync('OnPointClicked', intersection.object.name);
//            }
//        } else {
//            console.log('No intersection detected.');
//        }
//    });

//    canvas.addEventListener('mousemove', (event) => {
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        points.forEach(point => {
//            point.scale.set(1, 1, 1);
//        });

//        if (intersects.length > 0) {
//            const hoveredPoint = intersects[0].object;
//            hoveredPoint.scale.set(1.5, 1.5, 1.5);
//        }
//    });
//};

//window.registerClickCallback = (dotNetObject) => {
//    onClickCallback = dotNetObject;
//};





//let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls;

//window.initThreeJs = (canvasId, modelPath, modelPoints) => {
//    const canvas = document.getElementById(canvasId);
//    console.log('Model path:', modelPath); // Debug model path
//    console.log('Model points:', modelPoints); // Debug model points
//    if (!canvas) {
//        console.error('Canvas element not found:', canvasId);
//        return;
//    }
//    const width = canvas.parentElement.offsetWidth;
//    const height = canvas.parentElement.offsetHeight;

//    scene = new THREE.Scene();
//    scene.background = new THREE.Color(0xcccccc);

//    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
//    camera.position.set(0, 1.5, 3);

//    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
//    renderer.setSize(width, height);
//    renderer.shadowMap.enabled = false; // Disable shadow maps
//    controls = new THREE.OrbitControls(camera, renderer.domElement);
//    controls.enableDamping = true;
//    controls.dampingFactor = 0.05;
//    controls.screenSpacePanning = false;
//    controls.minDistance = 1;
//    controls.maxDistance = 10;

//    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
//    scene.add(ambientLight);
//    const pointLight = new THREE.PointLight(0xffffff, 1);
//    pointLight.position.set(5, 5, 5);
//    scene.add(pointLight);
//    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
//    directionalLight.position.set(5, 5, 5);
//    directionalLight.castShadow = false; // Explicitly disable shadows
//    scene.add(directionalLight);
//    raycaster = new THREE.Raycaster();
//    mouse = new THREE.Vector2();

//    const loader = new THREE.GLTFLoader();
//    loader.load(
//        modelPath, // Use the dynamic modelPath parameter
//        (gltf) => {
//            const model = gltf.scene;
//            model.rotation.x = 0; // Adjust if model is oriented incorrectly
//            scene.add(model);
//            model.position.set(0, 0, 0);

//            const box = new THREE.Box3().setFromObject(model);
//            const size = new THREE.Vector3();
//            box.getSize(size);
//            const center = new THREE.Vector3();
//            box.getCenter(center);
//            console.log('Model size:', size, 'Center:', center);

//            const maxDimension = Math.max(size.x, size.y, size.z);
//            if (maxDimension > 0) {
//                const scaleFactor = 8 / maxDimension; // Scale to fit ~2 units
//                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
//                console.log('Applied scale factor:', scaleFactor);
//            }

//            // Recompute bounding box after scaling
//            box.setFromObject(model);
//            box.getSize(size);
//            box.getCenter(center);

//            let parsedModelPoints = modelPoints;
//            if (typeof modelPoints === 'string') {
//                try {
//                    parsedModelPoints = JSON.parse(modelPoints);
//                } catch (e) {
//                    console.error('Error parsing modelPoints:', e);
//                    return;
//                }
//            }

//            // Debug received modelPoints
//            console.log('Received modelPoints:', parsedModelPoints);

//            // Add dynamic points with lines (instead of arrows)
//            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
//                parsedModelPoints.forEach((point, index) => {
//                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
//                        console.error('Invalid point data:', point);
//                        return;
//                    }

//                    // Define the point's position
//                    const x = center.x + (point.position[0] * size.x / 2);
//                    const y = center.y + (point.position[1] * size.y / 2);
//                    const z = center.z + (point.position[2] * size.z / 2);
//                    const pointPosition = new THREE.Vector3(x, y, z);

//                    // Create a small sphere to represent the point
//                    const sphereGeometry = new THREE.SphereGeometry(0.1, 16, 16); // Smaller sphere
//                    const sphereMaterial = new THREE.MeshBasicMaterial({
//                        color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`) // Unique color per point
//                    });
//                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//                    sphere.position.copy(pointPosition);
//                    sphere.name = point.id; // Keep ID for raycasting
//                    scene.add(sphere);
//                    points.push(sphere); // Add to points array for raycasting
//                    console.log('Point added:', point.id, 'Position:', sphere.position);

//                    // Create a line (instead of ArrowHelper) pointing to the point
//                    const lineLength = 1.0; // Long line length
//                    const direction = new THREE.Vector3()
//                        .subVectors(pointPosition, center)
//                        .normalize(); // Point line toward model center
//                    const lineStart = pointPosition
//                        .clone()
//                        .add(direction.clone().multiplyScalar(-lineLength)); // Offset line start
//                    const lineColor = new THREE.Color(`hsl(${index * 60}, 70%, 70%)`); // Lighter color for line

//                    // Create line geometry with two points (start and end)
//                    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
//                        lineStart, // Start of the line
//                        pointPosition // End at the sphere
//                    ]);
//                    const lineMaterial = new THREE.LineBasicMaterial({
//                        color: lineColor,
//                        linewidth: 2 // Slightly thicker line for visibility
//                    });
//                    const line = new THREE.Line(lineGeometry, lineMaterial);
//                    scene.add(line);
//                });
//            } else {
//                console.error('modelPoints is not a valid array:', parsedModelPoints);
//            }

//            // Adjust camera to view entire model
//            camera.position.set(center.x, center.y + size.y * 1.5, center.z + size.z * 2);
//            controls.target.set(center.x, center.y, center.z);
//            controls.update();
//        },
//        (progress) => {
//            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
//        },
//        (error) => {
//            console.error('Error loading GLTF model:', error);
//        }
//    );

//    function animate() {
//        requestAnimationFrame(animate);
//        controls.update();
//        renderer.render(scene, camera);
//    }
//    animate();

//    window.addEventListener('resize', () => {
//        const newWidth = canvas.parentElement.offsetWidth;
//        const newHeight = canvas.parentElement.offsetHeight;
//        camera.aspect = newWidth / newHeight;
//        camera.updateProjectionMatrix();
//        renderer.setSize(newWidth, newHeight);
//    });

//    canvas.addEventListener('click', (event) => {
//        event.preventDefault();

//        // Convert to normalized device coordinates
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;

//        // Raycast
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        if (intersects.length > 0) {
//            const intersection = intersects[0];
//            const pos = intersection.point;

//            // Print X, Y, Z coordinates to the console
//            console.log(`Clicked coordinates: x=${pos.x}, y=${pos.y}, z=${pos.z}`);
//        } else {
//            console.log('No intersection detected.');
//        }
//    });

//    // Optional: Add hover effect to highlight points
//    canvas.addEventListener('mousemove', (event) => {
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);

//        // Reset all points to original scale
//        points.forEach(point => {
//            point.scale.set(1, 1, 1); // Reset scale
//        });

//        if (intersects.length > 0) {
//            const hoveredPoint = intersects[0].object;
//            hoveredPoint.scale.set(1.5, 1.5, 1.5); // Scale up on hover
//        }
//    });
//};

//window.registerClickCallback = (dotNetObject) => {
//    onClickCallback = dotNetObject;
//};


//let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls;

//window.initThreeJs = (canvasId, modelPath, modelPoints) => {
//    const canvas = document.getElementById(canvasId);
//    console.log('Model path:', modelPath); // Debug model path
//    console.log('Model points:', modelPoints); // Debug model points
//    if (!canvas) {
//        console.error('Canvas element not found:', canvasId);
//        return;
//    }
//    const width = canvas.parentElement.offsetWidth;
//    const height = canvas.parentElement.offsetHeight;

//    scene = new THREE.Scene();
//    scene.background = new THREE.Color(0xcccccc);

//    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
//    camera.position.set(0, 1.5, 3);

//    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
//    renderer.setSize(width, height);
//    renderer.shadowMap.enabled = false; // Disable shadow maps
//    controls = new THREE.OrbitControls(camera, renderer.domElement);
//    controls.enableDamping = true;
//    controls.dampingFactor = 0.05;
//    controls.screenSpacePanning = false;
//    controls.minDistance = 1;
//    controls.maxDistance = 10;

//    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
//    scene.add(ambientLight);
//    const pointLight = new THREE.PointLight(0xffffff, 1);
//    pointLight.position.set(5, 5, 5);
//    scene.add(pointLight);
//    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
//    directionalLight.position.set(5, 5, 5);
//    directionalLight.castShadow = false; // Explicitly disable shadows
//    scene.add(directionalLight);
//    raycaster = new THREE.Raycaster();
//    mouse = new THREE.Vector2();

//    const loader = new THREE.GLTFLoader();
//    loader.load(
//        modelPath, // Use the dynamic modelPath parameter
//        (gltf) => {
//            const model = gltf.scene;
//            model.rotation.x = 0; // Adjust if model is oriented incorrectly
//            scene.add(model);
//            model.position.set(0, 0, 0);

//            const box = new THREE.Box3().setFromObject(model);
//            const size = new THREE.Vector3();
//            box.getSize(size);
//            const center = new THREE.Vector3();
//            box.getCenter(center);
//            console.log('Model size:', size, 'Center:', center);

//            const maxDimension = Math.max(size.x, size.y, size.z);
//            if (maxDimension > 0) {
//                const scaleFactor = 8 / maxDimension; // Scale to fit ~2 units
//                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
//                console.log('Applied scale factor:', scaleFactor);
//            }

//            // Recompute bounding box after scaling
//            box.setFromObject(model);
//            box.getSize(size);
//            box.getCenter(center);

//            let parsedModelPoints = modelPoints;
//            if (typeof modelPoints === 'string') {
//                try {
//                    parsedModelPoints = JSON.parse(modelPoints);
//                } catch (e) {
//                    console.error('Error parsing modelPoints:', e);
//                    return;
//                }
//            }

//            // Debug received modelPoints
//            console.log('Received modelPoints:', parsedModelPoints);

//            // Add dynamic points with adjusted positions
//            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
//                parsedModelPoints.forEach(point => {
//                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
//                        console.error('Invalid point data:', point);
//                        return;
//                    }
//                    const geometry = new THREE.SphereGeometry(0.1, 32, 32);
//                    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
//                    const sphere = new THREE.Mesh(geometry, material);

//                    // Adjust position relative to model center and scale
//                    const x = center.x + (point.position[0] * size.x / 2);
//                    const y = center.y + (point.position[1] * size.y / 2);
//                    const z = center.z + (point.position[2] * size.z / 2);
//                    sphere.position.set(x, y, z);
//                    sphere.name = point.id;
//                    scene.add(sphere);
//                    points.push(sphere);
//                    console.log('Point added:', point.id, 'Position:', sphere.position);
//                });
//            } else {
//                console.error('modelPoints is not a valid array:', parsedModelPoints);
//            }

//            // Adjust camera to view entire model
//            camera.position.set(center.x, center.y + size.y * 1.5, center.z + size.z * 2);
//            controls.target.set(center.x, center.y, center.z);
//            controls.update();
//        },
//        (progress) => {
//            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
//        },
//        (error) => {
//            console.error('Error loading GLTF model:', error);
//        }
//    );

//    function animate() {
//        requestAnimationFrame(animate);
//        controls.update();
//        renderer.render(scene, camera);
//    }
//    animate();

//    window.addEventListener('resize', () => {
//        const newWidth = canvas.parentElement.offsetWidth;
//        const newHeight = canvas.parentElement.offsetHeight;
//        camera.aspect = newWidth / newHeight;
//        camera.updateProjectionMatrix();
//        renderer.setSize(newWidth, newHeight);
//    });

//    canvas.addEventListener('click', (event) => {
//        event.preventDefault();
//        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
//        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
//        raycaster.setFromCamera(mouse, camera);
//        const intersects = raycaster.intersectObjects(points, false);
//        console.log('Click detected, intersects:', intersects);
//        if (intersects.length > 0) {
//            const clickedPoint = intersects[0].object;
//            if (onClickCallback) {
//                onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
//            }
//        }
//    });
//};

//window.registerClickCallback = (dotNetObject) => {
//    onClickCallback = dotNetObject;
//};