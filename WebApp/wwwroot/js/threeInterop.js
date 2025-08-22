let scene, camera, renderer, raycaster, mouse, points = [], onClickCallback, controls;

window.initThreeJs = (canvasId, modelPath, modelPoints) => {
    const canvas = document.getElementById(canvasId);
    console.log('Model path:', modelPath); // Debug model path
    console.log('Model points:', modelPoints); // Debug model points
    if (!canvas) {
        console.error('Canvas element not found:', canvasId);
        return;
    }
    const width = canvas.parentElement.offsetWidth;
    const height = canvas.parentElement.offsetHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcccccc);

    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 3);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = false; // Disable shadow maps
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 10;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = false; // Explicitly disable shadows
    scene.add(directionalLight);
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    const loader = new THREE.GLTFLoader();
    loader.load(
        modelPath, // Use the dynamic modelPath parameter
        (gltf) => {
            const model = gltf.scene;
            model.rotation.x = 0; // Adjust if model is oriented incorrectly
            scene.add(model);
            model.position.set(0, 0, 0);

            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);
            console.log('Model size:', size, 'Center:', center);

            const maxDimension = Math.max(size.x, size.y, size.z);
            if (maxDimension > 0) {
                const scaleFactor = 8 / maxDimension; // Scale to fit ~2 units
                model.scale.set(scaleFactor, scaleFactor, scaleFactor);
                console.log('Applied scale factor:', scaleFactor);
            }

            // Recompute bounding box after scaling
            box.setFromObject(model);
            box.getSize(size);
            box.getCenter(center);

            let parsedModelPoints = modelPoints;
            if (typeof modelPoints === 'string') {
                try {
                    parsedModelPoints = JSON.parse(modelPoints);
                } catch (e) {
                    console.error('Error parsing modelPoints:', e);
                    return;
                }
            }

            // Debug received modelPoints
            console.log('Received modelPoints:', parsedModelPoints);

            // Add dynamic points with lines (instead of arrows)
            if (parsedModelPoints && Array.isArray(parsedModelPoints)) {
                parsedModelPoints.forEach((point, index) => {
                    if (!point || !point.position || !Array.isArray(point.position) || point.position.length < 3) {
                        console.error('Invalid point data:', point);
                        return;
                    }

                    // Define the point's position
                    const x = center.x + (point.position[0] * size.x / 2);
                    const y = center.y + (point.position[1] * size.y / 2);
                    const z = center.z + (point.position[2] * size.z / 2);
                    const pointPosition = new THREE.Vector3(x, y, z);

                    // Create a small sphere to represent the point
                    const sphereGeometry = new THREE.SphereGeometry(0.1, 16, 16); // Smaller sphere
                    const sphereMaterial = new THREE.MeshBasicMaterial({
                        color: new THREE.Color(`hsl(${index * 60}, 70%, 50%)`) // Unique color per point
                    });
                    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                    sphere.position.copy(pointPosition);
                    sphere.name = point.id; // Keep ID for raycasting
                    scene.add(sphere);
                    points.push(sphere); // Add to points array for raycasting
                    console.log('Point added:', point.id, 'Position:', sphere.position);

                    // Create a line (instead of ArrowHelper) pointing to the point
                    const lineLength = 1.0; // Long line length
                    const direction = new THREE.Vector3()
                        .subVectors(pointPosition, center)
                        .normalize(); // Point line toward model center
                    const lineStart = pointPosition
                        .clone()
                        .add(direction.clone().multiplyScalar(-lineLength)); // Offset line start
                    const lineColor = new THREE.Color(`hsl(${index * 60}, 70%, 70%)`); // Lighter color for line

                    // Create line geometry with two points (start and end)
                    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                        lineStart, // Start of the line
                        pointPosition // End at the sphere
                    ]);
                    const lineMaterial = new THREE.LineBasicMaterial({
                        color: lineColor,
                        linewidth: 2 // Slightly thicker line for visibility
                    });
                    const line = new THREE.Line(lineGeometry, lineMaterial);
                    scene.add(line);
                });
            } else {
                console.error('modelPoints is not a valid array:', parsedModelPoints);
            }

            // Adjust camera to view entire model
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

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        const newWidth = canvas.parentElement.offsetWidth;
        const newHeight = canvas.parentElement.offsetHeight;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
    });

    canvas.addEventListener('click', (event) => {
        event.preventDefault();
        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(points, false);
        console.log('Click detected, intersects:', intersects);
        if (intersects.length > 0) {
            const clickedPoint = intersects[0].object;
            if (onClickCallback) {
                onClickCallback.invokeMethodAsync('OnPointClicked', clickedPoint.name);
            }
        }
    });

    // Optional: Add hover effect to highlight points
    canvas.addEventListener('mousemove', (event) => {
        mouse.x = ((event.clientX - canvas.getBoundingClientRect().left) / canvas.offsetWidth) * 2 - 1;
        mouse.y = -((event.clientY - canvas.getBoundingClientRect().top) / canvas.offsetHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(points, false);

        // Reset all points to original scale
        points.forEach(point => {
            point.scale.set(1, 1, 1); // Reset scale
        });

        if (intersects.length > 0) {
            const hoveredPoint = intersects[0].object;
            hoveredPoint.scale.set(1.5, 1.5, 1.5); // Scale up on hover
        }
    });
};

window.registerClickCallback = (dotNetObject) => {
    onClickCallback = dotNetObject;
};


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