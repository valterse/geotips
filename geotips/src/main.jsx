import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

//country data
import chinaConfig from "./Countries/Asia/China.jsx";
import usaConfig from "./Countries/NorthAmerica/USA.jsx";
import russiaConfig from "./Countries/Europe/Russia.jsx";

// Initialize scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2e2e2e);

// Setup camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 5);

const textureLoader = new THREE.TextureLoader();
textureLoader.load(
    '/assets/output.png',
    (texture) => {
        const sphereMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.9,  // Adjust for visibility
            color: 0x333333  // Dark base for outlines
        });
        sphere.material = sphereMaterial;
    }
);

// Create renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Earth sphere parameters
const sphereRadius = 2;
const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(sphereRadius, 32, 32),
    new THREE.MeshStandardMaterial({
        color: 0x3333ff, // Fallback color
        metalness: 0,    // No metallic reflection
        roughness: 1,    // Fully rough (no specular highlights)
        flatShading: true // More uniform appearance
    })
);
scene.add(sphere);

// Lighting - Simple uniform lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Strong ambient light for even illumination
scene.add(ambientLight);



// Create a group for all country outlines
const countriesGroup = new THREE.Group();
scene.add(countriesGroup);

// Country outlines creation function (unchanged)
const createCountryOutlines = (geojson, radius) => {
    const countryMeshes = [];

    // Create the material once at the beginning
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xE6E6FA, // Pastel purple (Lavender)
        transparent: true,
        opacity: 0.8 // Slightly more opaque
    });

    // Helper function to interpolate between two points with reduced segments
    const interpolatePoints = (start, end, segments) => {
        const points = [];
        points.push(start);
        points.push(end); // Add the end point as well
        return points;
    };

    geojson.features.forEach(country => {
        try {
            const processRing = (ring) => {
                const positions = [];
                const segments = 0; // No additional points between vertices
                const step = 1; // step size for points

                for (let i = 0; i < ring.length; i += step) {
                    const start = ring[i];
                    // For the last point, connect back to the first point
                    const end = ring[(i + 1) % ring.length];

                    // Get interpolated points between current and next point
                    const interpolated = interpolatePoints(start, end, segments);

                    // Convert all points to 3D positions
                    interpolated.forEach(coord => {
                        const lon = THREE.MathUtils.degToRad(coord[0]);
                        const lat = THREE.MathUtils.degToRad(coord[1]);

                        positions.push(
                            radius * Math.cos(lat) * Math.cos(-lon),
                            radius * Math.sin(lat),
                            radius * Math.cos(lat) * Math.sin(-lon)
                        );
                    });
                }

                return positions;
            };

            const coordinates = country.geometry.coordinates;
            const isMultiPolygon = country.geometry.type === 'MultiPolygon';
            const polygons = isMultiPolygon ? coordinates : [coordinates];

            // Create a group for this country
            const countryGroup = new THREE.Group();
            countryGroup.userData = {
                country: country.properties.name,
                countryCode: country.properties.iso_a2 || 'N/A',
                hovered: false,
                lines: [],
                center: new THREE.Vector3(0, 0, 0),
                pointCount: 0
            };

            polygons.forEach(polygon => {
                const outerRing = polygon[0];
                const outlinePositions = processRing(outerRing);

                if (outlinePositions.length > 3) {
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(outlinePositions, 3));
                    geometry.setAttribute('originalPosition', new THREE.Float32BufferAttribute(outlinePositions.slice(), 3));

                    const line = new THREE.Line(geometry, lineMaterial.clone());
                    line.userData = { parent: countryGroup };
                    countryGroup.add(line);
                    countryGroup.userData.lines.push(line);

                    // Accumulate points for calculating center
                    for (let i = 0; i < outlinePositions.length; i += 3) {
                        countryGroup.userData.center.x += outlinePositions[i];
                        countryGroup.userData.center.y += outlinePositions[i + 1];
                        countryGroup.userData.center.z += outlinePositions[i + 2];
                        countryGroup.userData.pointCount++;
                    }
                }

                // Process holes with the same reduced density
                for (let i = 1; i < polygon.length; i++) {
                    const holePositions = processRing(polygon[i]);
                    if (holePositions.length > 3) {
                        const holeGeometry = new THREE.BufferGeometry();
                        holeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(holePositions, 3));
                        holeGeometry.setAttribute('originalPosition', new THREE.Float32BufferAttribute(holePositions.slice(), 3));
                        const holeLine = new THREE.Line(holeGeometry, lineMaterial.clone());
                        holeLine.userData = { parent: countryGroup };
                        countryGroup.add(holeLine);
                        countryGroup.userData.lines.push(holeLine);

                        // Accumulate points for calculating center
                        for (let i = 0; i < holePositions.length; i += 3) {
                            countryGroup.userData.center.x += holePositions[i];
                            countryGroup.userData.center.y += holePositions[i + 1];
                            countryGroup.userData.center.z += holePositions[i + 2];
                            countryGroup.userData.pointCount++;
                        }
                    }
                }
            });

            // Calculate the average center position
            if (countryGroup.userData.pointCount > 0) {
                countryGroup.userData.center.divideScalar(countryGroup.userData.pointCount);
                // Normalize to ensure it's on the sphere surface
                countryGroup.userData.center.normalize().multiplyScalar(radius);
            }

            countriesGroup.add(countryGroup);
            countryMeshes.push(countryGroup);
        } catch (e) {
            console.warn(`Error processing ${country.properties?.name || 'unknown country'}:`, e);
        }
    });

    return countryMeshes;
};


// Load GeoJSON and create outlines
let countryMeshes = [];
fetch('/assets/countries.geo.json')
    .then(res => res.json())
    .then(geojson => {
        countryMeshes = createCountryOutlines(geojson, sphereRadius * 1.01);
    })
    .catch(err => {
        console.error('Error loading country data:', err);
        // Fallback: Add test object
        const testGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const testMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        scene.add(new THREE.Mesh(testGeometry, testMaterial));
    });

// Hover handling (unchanged)
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredCountry = null;
const elevationAmount = 0.01;
const hoverColor = new THREE.Color(0xFFD700);
const normalColor = new THREE.Color(0xE6E6FA);
const tempSphereIntersection = new THREE.Vector3();

function isPointInCountry(point, country, radius) {
    const pointLon = Math.atan2(point.z, point.x);
    const pointLat = Math.asin(point.y / radius);

    for (const line of country.userData.lines) {
        const positions = line.geometry.attributes.originalPosition;
        const polygonPoints = [];

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            const lon = Math.atan2(z, x);
            const lat = Math.asin(y / radius);
            polygonPoints.push([lon, lat]);
        }

        if (pointInPolygonSpherical([pointLon, pointLat], polygonPoints)) {
            return true;
        }
    }

    return false;
}

function pointInPolygonSpherical(point, polygon) {
    let inside = false;
    const [x, y] = point;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];

        const xii = xi;
        const xjj = xj;
        let x0 = xii, x1 = xjj;
        if (xii > xjj) {
            x0 = xjj;
            x1 = xii;
        }

        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xjj - xii) * (y - yi) / (yj - yi) + xii);

        if (x1 - x0 > Math.PI) {
            const intersect2 = ((yi > y) !== (yj > y)) &&
                (x + 2*Math.PI < (xjj - xii) * (y - yi) / (yj - yi) + xii);
            if (intersect2) {
                inside = !inside;
                continue;
            }
        }

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}

function handlePointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const sphereIntersects = raycaster.intersectObject(sphere);

    if (sphereIntersects.length === 0) {
        if (hoveredCountry) resetHoveredCountry();
        return;
    }

    const intersection = sphereIntersects[0].point;
    let newHoveredCountry = null;

    const visibleCountries = [];
    countryMeshes.forEach(country => {
        if (isCountryVisible(country, camera)) {
            visibleCountries.push(country);
        }
    });

    visibleCountries.sort((a, b) => {
        return a.userData.center.distanceTo(camera.position) -
            b.userData.center.distanceTo(camera.position);
    });

    for (const country of visibleCountries) {
        if (isPointInCountry(intersection, country, sphereRadius * 1.01)) {
            newHoveredCountry = country;
            break;
        }
    }

    if (hoveredCountry !== newHoveredCountry) {
        if (hoveredCountry) resetHoveredCountry();
        if (newHoveredCountry) {
            hoveredCountry = newHoveredCountry;
            hoveredCountry.userData.hovered = true;

            hoveredCountry.userData.lines.forEach(line => {
                const positionAttr = line.geometry.attributes.position;
                const originalPositions = line.geometry.attributes.originalPosition;

                for (let i = 0; i < positionAttr.count; i++) {
                    const origX = originalPositions.getX(i);
                    const origY = originalPositions.getY(i);
                    const origZ = originalPositions.getZ(i);
                    const pointNormal = new THREE.Vector3(origX, origY, origZ).normalize();

                    positionAttr.setXYZ(
                        i,
                        origX + pointNormal.x * elevationAmount,
                        origY + pointNormal.y * elevationAmount,
                        origZ + pointNormal.z * elevationAmount
                    );
                }
                positionAttr.needsUpdate = true;
                line.material.color.copy(hoverColor);
                line.material.opacity = 0.9;
            });

            console.log('Hovering:', hoveredCountry.userData.country);
        }
    }
}

function isCountryVisible(country, camera) {
    const center = country.userData.center.clone();
    center.project(camera);

    return center.x >= -1 && center.x <= 1 &&
        center.y >= -1 && center.y <= 1 &&
        center.z >= -1 && center.z <= 1;
}

function resetHoveredCountry() {
    if (hoveredCountry) {
        hoveredCountry.userData.hovered = false;
        hoveredCountry.userData.lines.forEach(line => {
            const positionAttr = line.geometry.attributes.position;
            const originalPositions = line.geometry.attributes.originalPosition;
            for (let i = 0; i < positionAttr.count; i++) {
                positionAttr.setXYZ(i,
                    originalPositions.getX(i),
                    originalPositions.getY(i),
                    originalPositions.getZ(i)
                );
            }
            positionAttr.needsUpdate = true;
            line.material.color.copy(normalColor);
            line.material.opacity = 0.7;
        });
        hoveredCountry = null;
    }
}

function handleClick(event) {
    if (hoveredCountry) {
        console.log('Clicked:', hoveredCountry.userData.country, hoveredCountry.userData.countryCode);
    }
}

window.addEventListener('mousemove', handlePointerMove);
window.addEventListener('click', handleClick);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = sphereRadius * 1.2;
controls.maxDistance = sphereRadius * 10;

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});