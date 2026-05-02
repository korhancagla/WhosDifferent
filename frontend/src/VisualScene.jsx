import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const palette = {
  lobby: ['#14b8a6', '#f59e0b', '#1e293b'],
  drawing: ['#22c55e', '#38bdf8', '#0f172a'],
  voting: ['#f59e0b', '#fb7185', '#111827'],
  result: ['#e11d48', '#a78bfa', '#030712'],
};

function createParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 28);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export default function VisualScene({ phase = 'lobby', intensity = 'calm' }) {
  const mountRef = useRef(null);
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 8);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const ringGeometry = new THREE.TorusKnotGeometry(1.25, 0.08, 180, 12);
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: '#14b8a6',
      emissive: '#0f766e',
      emissiveIntensity: 0.8,
      metalness: 0.45,
      roughness: 0.25,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    group.add(ring);

    const orbGeometry = new THREE.IcosahedronGeometry(0.85, 2);
    const orbMaterial = new THREE.MeshStandardMaterial({
      color: '#f59e0b',
      emissive: '#92400e',
      emissiveIntensity: 0.7,
      flatShading: true,
      metalness: 0.18,
      roughness: 0.42,
    });
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    group.add(orb);

    const particleCount = 180;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 11;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particlesMaterial = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 0.06,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      map: createParticleTexture(),
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambient);

    const key = new THREE.PointLight(0xffffff, 26, 18);
    key.position.set(3, 4, 5);
    scene.add(key);

    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      const colors = palette[phaseRef.current] || palette.lobby;
      const speed = intensity === 'burst' ? 1.7 : phaseRef.current === 'voting' ? 1.15 : 0.75;

      ringMaterial.color.set(colors[0]);
      ringMaterial.emissive.set(colors[0]);
      orbMaterial.color.set(colors[1]);
      orbMaterial.emissive.set(colors[1]);
      particlesMaterial.color.set(colors[1]);

      group.rotation.x = elapsed * 0.12 * speed;
      group.rotation.y = elapsed * 0.2 * speed;
      ring.rotation.z = elapsed * 0.26 * speed;
      orb.rotation.x = elapsed * 0.34 * speed;
      orb.rotation.y = elapsed * 0.18 * speed;
      orb.scale.setScalar(1 + Math.sin(elapsed * 1.8) * 0.04);
      particles.rotation.y = elapsed * 0.035;
      particles.rotation.x = Math.sin(elapsed * 0.3) * 0.08;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      orbGeometry.dispose();
      orbMaterial.dispose();
      particlesGeometry.dispose();
      particlesMaterial.dispose();
    };
  }, [intensity]);

  return <div ref={mountRef} className="pointer-events-none fixed inset-0 z-0 opacity-70" aria-hidden="true" />;
}
