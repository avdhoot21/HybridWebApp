let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls, composer, outlinePass, pointLight;

window.initThreeJs = (canvasId, modelPath, modelPoints) => {
    const canvas = document.getElementById(canvasId);
    console.log('Model path:', modelPath);
    console.log('Model points:', modelPoints);
    if (!canvas) {
        console.error('Canvas element not found:', canvasId);
        return;
    }
    const width = canvas.parentElement.offsetWidth;
    const height = canvas.parentElement.offsetHeight;

    scene = new THREE.Scene();

    // Set gradient background
    scene.background = createGradientBackground();

    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 3);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = false;

    // Set up post-processing for outline effect
    try {
        composer = new THREE.EffectComposer(renderer);
        const renderPass = new THREE.RenderPass(scene, camera);
        composer.addPass(renderPass);
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

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = false;
    controls.minDistance = 0.5;
    controls.maxDistance = 8;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 1.0;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    pointLight = new THREE.PointLight(0xffffff, 1.5, 10);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

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

    loader.load(
        modelPath,
        (gltf) => {
            model = gltf.scene;
            scene.add(model);
            model.position.set(0, 0, 0);

            // Compute bounding box for camera positioning
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);
            console.log('Model size:', size, 'Center:', center);

            // Scale model to fit within ~2 units
            const maxDimension = Math.max(size.x, size.y, size.z);
            if (maxDimension > 0) {
                const scaleFactor = 2 / maxDimension;
                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
                console.log('Applied scale factor:', scaleFactor);
            }

            // Recompute bounding box after scaling
            box.setFromObject(model);
            box.getSize(size);
            box.getCenter(center);

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

            // Add points using raw Blender coordinates
            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
                parsedModelPoints.forEach((point, index) => {
                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
                        console.error('Invalid point data:', point);
                        return;
                    }

                    // Use raw coordinates, scaled by model’s scale factor
                    const x = point.position[0] * model.scale.x;
                    const y = point.position[1] * model.scale.y;
                    const z = point.position[2] * model.scale.z;
                    const pointPosition = new THREE.Vector3(x, y, z);

                    // Create a sphere for raycasting
                    const sphereGeometry = new THREE.SphereGeometry(0.02, 32, 32);
                    const sphereMaterial = new THREE.MeshBasicMaterial({
                        color: new THREE.Color(0xffff00), // Bright yellow color
                        //color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`),
                        transparent: true,
                        opacity: 0.7 // Set to 0 to make invisible
                    });
                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                    sphere.position.copy(pointPosition);
                    sphere.name = point.id;
                    scene.add(sphere);
                    points.push(sphere);

                    // Add 3D text label if font is loaded
                    if (font) {
                        try {
                            const textGeometry = new THREE.TextGeometry(point.id, {
                                font: font,
                                size: 0.05,
                                height: 0.01
                            });
                            const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
                            const textMesh = new THREE.Mesh(textGeometry, textMaterial);
                            textMesh.position.copy(pointPosition).add(new THREE.Vector3(0.1, 0, 0));
                            scene.add(textMesh);
                            sphere.userData.textLabel = textMesh;
                        } catch (e) {
                            console.warn('Failed to create text label for point:', point.id, e);
                        }
                    }

                    // Store model for outline
                    sphere.userData.model = model;

                    console.log(`Point added: ${point.id} at world [${x}, ${y}, ${z}]`);
                });
            } else {
                console.error('modelPoints is not a valid array:', parsedModelPoints);
            }

            // Adjust camera
            camera.position.set(center.x, center.y + size.y * 1.5, center.z + size.z * 2);
            controls.target.set(center.x, center.y, center.z);
            controls.update();
        },
        (progress) => {
            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading GLTF model:', error);
        }
    );

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
    tooltip.style.color = 'white';
    tooltip.style.padding = '5px 10px';
    tooltip.style.borderRadius = '5px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    function animate() {
        requestAnimationFrame(animate);
        controls.update();

        // Handle camera zoom, light, and particle animation
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

                // Update outline effect
                if (outlinePass) {
                    outlinePass.selectedObjects = [point.userData.model];
                }

                // Handle particle animation
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

                console.log(`Animating camera/light for point ${point.name}: progress=${progress.toFixed(2)}, cameraPos=[${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}]`);

                if (progress >= 1) {
                    point.userData.isAnimating = false;
                    delete point.userData.cameraAnimation;
                    if (outlinePass) {
                        outlinePass.selectedObjects = [];
                    }
                    console.log(`Camera/light animation completed for point ${point.name}`);
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

    window.addEventListener('resize', () => {
        const newWidth = canvas.parentElement.offsetWidth;
        const newHeight = canvas.parentElement.offsetHeight;
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
    canvas.addEventListener('click', (event) => {
        event.preventDefault();
        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // Raycast against points and model
        const intersectsPoints = raycaster.intersectObjects(points, false);
        const intersectsModel = raycaster.intersectObject(model, true); // true for recursive check on model children

        // Disable auto-rotation on any click
        controls.autoRotate = false;

        if (intersectsPoints.length > 0) {
            // Point intersection
            const intersection = intersectsPoints[0];
            const pos = intersection.point;
            const clickedPoint = intersection.object;

            console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

            // Reset any ongoing animations
            points.forEach(p => {
                p.userData.isAnimating = false;
                delete p.userData.cameraAnimation;
                if (p.userData.particles) {
                    scene.remove(p.userData.particles);
                    delete p.userData.particles;
                    delete p.userData.particleVelocities;
                }
            });

            // Start camera and light zoom animation
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

            // Add particle burst
            const particleCount = 10;
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
                size: 0.03,
                transparent: true,
                opacity: 1
            });
            const particles = new THREE.Points(particleGeometry, particleMaterial);
            scene.add(particles);
            clickedPoint.userData.particles = particles;
            clickedPoint.userData.particleVelocities = velocities;

            console.log(`Starting camera/light zoom and particle burst for point ${clickedPoint.name}`);

            if (onClickCallback) {
                onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
            }
        } else if (intersectsModel.length > 0) {
            // Model intersection
            const intersection = intersectsModel[0];
            const pos = intersection.point;
            console.log(`Clicked model at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
        } else {
            // No intersection: compute point along ray at fixed distance
            const rayDirection = raycaster.ray.direction.clone();
            const rayOrigin = raycaster.ray.origin.clone();
            const distance = 5; // Arbitrary distance from camera
            const pos = rayOrigin.add(rayDirection.multiplyScalar(distance));
            console.log(`Clicked empty space at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);
        }
    });
    //canvas.addEventListener('click', (event) => {
    //    event.preventDefault();
    //    mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
    //    mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
    //    raycaster.setFromCamera(mouse, camera);
    //    const intersects = raycaster.intersectObjects(points, false);

    //    if (intersects.length > 0) {
    //        const intersection = intersects[0];
    //        const pos = intersection.point;
    //        const clickedPoint = intersection.object;

    //        console.log(`Clicked point ${clickedPoint.name} at coordinates: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, z=${pos.z.toFixed(2)}`);

    //        // Disable auto-rotation on click
    //        controls.autoRotate = false;

    //        // Reset any ongoing animations
    //        points.forEach(p => {
    //            p.userData.isAnimating = false;
    //            delete p.userData.cameraAnimation;
    //            if (p.userData.particles) {
    //                scene.remove(p.userData.particles);
    //                delete p.userData.particles;
    //                delete p.userData.particleVelocities;
    //            }
    //        });

    //        // Start camera and light zoom animation
    //        clickedPoint.userData.isAnimating = true;
    //        clickedPoint.userData.cameraAnimation = {
    //            start: Date.now(),
    //            duration: 1000,
    //            startPos: camera.position.clone(),
    //            targetPos: pos.clone().add(new THREE.Vector3(0, 0, 0.5)),
    //            startTarget: controls.target.clone(),
    //            targetPoint: pos.clone(),
    //            startLightPos: pointLight.position.clone()
    //        };

    //        // Add particle burst
    //        const particleCount = 10;
    //        const positions = new Float32Array(particleCount * 3);
    //        const velocities = [];
    //        for (let i = 0; i < particleCount; i++) {
    //            positions[i * 3] = pos.x;
    //            positions[i * 3 + 1] = pos.y;
    //            positions[i * 3 + 2] = pos.z;
    //            velocities.push(new THREE.Vector3(
    //                (Math.random() - 0.5) * 2,
    //                (Math.random() - 0.5) * 2,
    //                (Math.random() - 0.5) * 2
    //            ).normalize());
    //        }
    //        const particleGeometry = new THREE.BufferGeometry();
    //        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    //        const particleMaterial = new THREE.PointsMaterial({
    //            color: new THREE.Color(`hsl(${Math.random() * 360}, 70%, 50%)`),
    //            size: 0.03,
    //            transparent: true,
    //            opacity: 1
    //        });
    //        const particles = new THREE.Points(particleGeometry, particleMaterial);
    //        scene.add(particles);
    //        clickedPoint.userData.particles = particles;
    //        clickedPoint.userData.particleVelocities = velocities;

    //        console.log(`Starting camera/light zoom and particle burst for point ${clickedPoint.name}`);

    //        if (onClickCallback) {
    //            onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
    //        }
    //    } else {
    //        console.log('No intersection detected.');
    //    }
    //});

    canvas.addEventListener('mousemove', (event) => {
        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(points, false);

        // Reset scale and hide tooltip
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
                // Show tooltip
                tooltip.style.display = 'block';
                tooltip.innerText = hoveredPoint.name;
                tooltip.style.left = `${event.clientX + 10}px`;
                tooltip.style.top = `${event.clientY + 10}px`;
            }
        }
    });

    // Gradient background function
    function createGradientBackground() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, '#1a1a3d');
        gradient.addColorStop(1, '#4b0082');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);
        return new THREE.CanvasTexture(canvas);
    }
};

// Toggle auto-rotation
window.toggleAutoRotate = (enable) => {
    if (controls) {
        controls.autoRotate = enable;
        console.log(`Auto-rotation ${enable ? 'enabled' : 'disabled'}`);
    }
};

window.registerClickCallback = (dotNetObject) => {
    onClickCallback = dotNetObject;
};




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