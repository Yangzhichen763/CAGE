"use strict";

function launchFireworks(mouseX, mouseY, targetX, targetY) {
    const canvas = document.getElementById("fireworks-canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const startX = mouseX || canvas.width / 2;
    const startY = mouseY || canvas.height / 2;

    const dx = (targetX || startX) - startX;
    const dy = (targetY || startY) - startY + 50;

    const mainAngle = Math.atan2(-dy, dx);
    const angleUp = Math.abs(mainAngle) < Math.PI / 2;
    const spreadFactor = angleUp ? 0.5 + (1 - Math.abs(mainAngle) / (Math.PI / 2)) * 0.5 : 1;
    const spreadAngle = (Math.PI / 4) * spreadFactor;

    const strips = [];
    const particles = [];
    const stripColors = [
        "#FF3B30",
        "#FF9500",
        "#FFCC00",
        "#34C759",
        "#007AFF",
        "#5856D6",
        "#AF52DE",
        "#FF2D55",
    ];
    const ballColors = ["#E6D5B8", "#D4A5A5", "#A5B8D4", "#A5D4B8", "#B8A5D4"];
    const modes = ["sin", "cos", "triangle", "square", "sawtooth"];
    const particleShapes = ["circle", "square", "triangle", "diamond", "star"];

    const gravity = 0.3;
    const stripGravity = 0.3;
    let flashFrame = 0;
    let startTime = Date.now();
    const boundDecay = 0.5;
    const moveDecay = 0.9;
    const hangingRate = 0.1;

    const totalCount = Math.floor(Math.random() * 16) + 32;
    const particleCount = Math.floor(totalCount / 3);
    const stripCount = totalCount - particleCount;

    for (let i = 0; i < stripCount; i++) {
        const angleOffset = (Math.random() - 0.5) * spreadAngle * 2;
        const angle = mainAngle + angleOffset;
        const speed = Math.random() * 10 + 6;
        const mode = modes[i % modes.length];

        strips.push({
            x: startX,
            y: startY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: stripColors[Math.floor(Math.random() * stripColors.length)],
            length: Math.random() * 22 + 15,
            width: 3,
            mode: mode,
            amplitude: Math.random() * 3 + 3,
            frequency: Math.random() * 1 + 2,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.3,
            life: 360,
            maxLife: 360,
            fadeDelay: Math.random() * 60,
            anchored: false,
            anchorTime: 0,
            anchorX: 0,
            anchorY: 0,
            angularVelocity: 0,
            pendulumAngle: 0,
            swayOffset: Math.random() * Math.PI * 2,
            swayFrequency: Math.random() * 0.05 + 0.03,
        });
    }

    for (let i = 0; i < particleCount; i++) {
        const angleOffset = (Math.random() - 0.5) * spreadAngle * 2;
        const angle = mainAngle + angleOffset;
        const speed = Math.random() * 15 + 10;

        particles.push({
            x: startX,
            y: startY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 3 + 1.5,
            color: ballColors[Math.floor(Math.random() * ballColors.length)],
            shape: particleShapes[Math.floor(Math.random() * particleShapes.length)],
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.2,
            life: 300,
            maxLife: 300,
            bounce: 0.8,
            fadeDelay: Math.random() * 60,
        });
    }

    function drawStrip(ctx, p) {
        ctx.fillStyle = p.color;
        ctx.beginPath();

        const points = [];
        for (let t = 0; t <= 1; t += 0.05) {
            const x = (t - 0.5) * p.length;
            let y = 0;

            switch (p.mode) {
                case "sin":
                    y = Math.sin(t * p.frequency * Math.PI) * p.amplitude;
                    break;
                case "cos":
                    y = Math.cos(t * p.frequency * Math.PI * 2) * p.amplitude;
                    break;
                case "triangle":
                    y = Math.abs(2 * t - 1) * p.amplitude * 2 - p.amplitude;
                    break;
                case "square":
                    y = (t < 0.5 ? 1 : -1) * p.amplitude;
                    break;
                case "sawtooth":
                    y = (t * 2 - 1) * p.amplitude;
                    break;
            }

            points.push({ x, y });
        }

        for (let i = 0; i < points.length; i++) {
            const pt = points[i];
            if (i === 0) {
                ctx.moveTo(pt.x, pt.y - p.width / 2);
            } else {
                ctx.lineTo(pt.x, pt.y - p.width / 2);
            }
        }

        for (let i = points.length - 1; i >= 0; i--) {
            const pt = points[i];
            ctx.lineTo(pt.x, pt.y + p.width / 2);
        }

        ctx.closePath();
        ctx.fill();
    }

    function drawParticle(ctx, p) {
        ctx.fillStyle = p.color;
        ctx.beginPath();

        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        switch (p.shape) {
            case "circle":
                ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                break;
            case "square":
                ctx.rect(-p.size, -p.size, p.size * 2, p.size * 2);
                break;
            case "triangle":
                ctx.moveTo(0, -p.size);
                ctx.lineTo(p.size, p.size);
                ctx.lineTo(-p.size, p.size);
                ctx.closePath();
                break;
            case "diamond":
                ctx.moveTo(0, -p.size);
                ctx.lineTo(p.size, 0);
                ctx.lineTo(0, p.size);
                ctx.lineTo(-p.size, 0);
                ctx.closePath();
                break;
            case "star":
                for (let i = 0; i < 5; i++) {
                    const outerAngle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
                    const innerAngle = outerAngle + Math.PI / 5;
                    ctx.lineTo(Math.cos(outerAngle) * p.size, Math.sin(outerAngle) * p.size);
                    ctx.lineTo(Math.cos(innerAngle) * p.size * 0.5, Math.sin(innerAngle) * p.size * 0.5);
                }
                ctx.closePath();
                break;
        }

        ctx.fill();
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (flashFrame < 10) {
            flashFrame++;
            const alpha = Math.sin((flashFrame * Math.PI) / 5) * 0.8;
            ctx.beginPath();
            ctx.arc(startX, startY, 50 + flashFrame * 5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
            ctx.fill();
        }

        const elapsed = (Date.now() - startTime) / 1000;
        const stripFadeStart = 1.0;
        const particleFadeStart = 3.0;
        const fadeDuration = 1.0;

        strips.forEach((p) => {
            p.life--;

            if (p.anchored) {
                p.anchorTime++;
                p.life++;

                p.pendulumAngle += p.angularVelocity;
                p.angularVelocity += -p.pendulumAngle * 0.01;
                p.angularVelocity *= 0.985;

                p.x = p.anchorX;
                p.y = p.anchorY;
                p.rotation = Math.PI / 2 + p.pendulumAngle;

                if (p.anchorTime >= 60 + Math.random() * 120) {
                    p.anchored = false;
                    p.vx = Math.cos(p.pendulumAngle) * p.angularVelocity * p.length;
                    p.vy = Math.sin(p.pendulumAngle) * p.angularVelocity * p.length + 1;
                }
            } else {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += stripGravity;
                p.vx *= 0.99;

                if (p.vy > 10.0) {
                    p.vy = 10.0;
                }

                p.rotation += p.rotationSpeed;

                p.x += Math.sin(p.life * p.swayFrequency + p.swayOffset) * 0.5;

                if (p.y <= 0) {
                    if (!p.anchored && Math.random() < hangingRate) {
                        p.anchored = true;
                        p.anchorTime = 0;
                        p.anchorX = p.x;
                        p.anchorY = 0;
                        p.angularVelocity = -p.vx * 0.05;
                        p.pendulumAngle = 0;
                    } else {
                        p.y = 0;
                        p.vy = Math.abs(p.vy) * 0.1;
                        p.vx = Math.abs(p.vx) * 0.5;
                    }
                }
            }

            if (p.life > 0 && p.y < canvas.height + 100) {
                ctx.save();

                let alpha = p.life / p.maxLife;
                const pFadeStart = stripFadeStart + p.fadeDelay / 60;
                if (elapsed >= pFadeStart) {
                    alpha *= Math.max(0, 1 - (elapsed - pFadeStart) / fadeDuration);
                }
                ctx.globalAlpha = alpha;

                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                drawStrip(ctx, p);
                ctx.restore();
            }
        });

        particles.forEach((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += gravity;
            p.rotation += p.rotationSpeed;
            p.life--;

            if (p.x - p.size <= 0) {
                p.x = p.size;
                p.vx *= -p.bounce;
            } else if (p.x + p.size >= canvas.width) {
                p.x = canvas.width - p.size;
                p.vx *= -p.bounce;
            }

            if (p.y - p.size <= 0) {
                p.y = p.size;
                p.vy *= -p.bounce;
            } else if (p.y + p.size >= canvas.height) {
                p.y = canvas.height - p.size;
                p.vy *= -p.bounce * boundDecay;
                p.vx *= moveDecay;
            }

            if (p.life > 0) {
                ctx.save();

                let alpha = Math.min(1, p.life / p.maxLife);
                const pFadeStart = particleFadeStart + (p.fadeDelay / 60) * 2;
                if (elapsed >= pFadeStart) {
                    alpha *= Math.max(0, 1 - (elapsed - pFadeStart) / fadeDuration);
                }
                ctx.globalAlpha = alpha;

                drawParticle(ctx, p);
                ctx.restore();
            }
        });

        if (
            strips.some((p) => p.life > 0 && p.y < canvas.height + 100) ||
            particles.some((p) => p.life > 0)
        ) {
            requestAnimationFrame(animate);
        }
    }

    animate();
}

window.CAGEFireworks = { launch: launchFireworks };
