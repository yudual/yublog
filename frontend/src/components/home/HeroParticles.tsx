"use client";

import { useEffect, useRef } from "react";

// 景深散斑（大光圈模糊光晕，带来沉浸式梦幻纵深）
interface BokehOrb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  baseAlpha: number;
  color: string;
  pulsePhase: number;
}

// 晶莹微星尘（如晨曦阳光下的金尘 / 深空碎钻）
interface DustMote {
  x: number;
  y: number;
  speed: number;
  angle: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  twinklePhase: number;
  twinkleSpeed: number;
  color: string;
  isGlint: boolean; // 是否在峰值时带有高贵微芒
}

// 偶发极简丝线流星
interface ShootingMeteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  alpha: number;
  decay: number;
}

export default function HeroParticles({ fixed = false }: { fixed?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = fixed ? window.innerWidth : (canvas.clientWidth || window.innerWidth);
    let height = fixed ? window.innerHeight : (canvas.clientHeight || 600);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const isDark = () => document.documentElement.classList.contains("dark");

    // ================= 1. 彻底重构色盘 (彻底消灭浅色模式下的灰黑“脏点”) =================
    const getColors = (dark: boolean) => {
      if (dark) {
        return {
          bokeh: [
            "168, 85, 247", // 梦幻紫罗兰散斑
            "245, 158, 11", // 暖金散斑
            "56, 189, 248", // 冰青散斑
            "236, 72, 153", // 玫瑰散斑
          ],
          dust: [
            "255, 255, 255", // 纯粹星白
            "255, 255, 255",
            "253, 230, 138", // 温暖香槟金
            "224, 242, 254", // 冰青冷星
            "243, 232, 255", // 极淡粉紫
          ],
        };
      } else {
        // 浅色模式下：只使用极柔和的阳光暖珀、晨曦金与透光白晶，杜绝任何发灰发黑像灰尘的杂色
        return {
          bokeh: [
            "245, 158, 11", // 暖琥珀光斑
            "217, 70, 239", // 柔光紫红
            "14, 165, 233", // 晨曦微青
          ],
          dust: [
            "245, 158, 11", // 温暖阳光微尘
            "217, 119, 6",
            "180, 83, 9",
            "147, 51, 234", // 柔和紫堇金
            "255, 255, 255", // 高光纯白反光点
          ],
        };
      }
    };

    const palette = getColors(isDark());

    // ================= 2. 镜头大光圈模糊散斑 (仅 7~10 颗，带来顶级电影级景深) =================
    const BOKEH_COUNT = Math.max(6, Math.min(10, Math.floor(width / 180)));
    const bokehs: BokehOrb[] = [];

    for (let i = 0; i < BOKEH_COUNT; i++) {
      const radius = 18 + Math.random() * 26; // 18px ~ 44px 的柔光散斑
      const baseAlpha = isDark() ? 0.04 + Math.random() * 0.05 : 0.03 + Math.random() * 0.04;
      bokehs.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        radius,
        baseAlpha,
        alpha: baseAlpha,
        color: palette.bokeh[Math.floor(Math.random() * palette.bokeh.length)],
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // ================= 3. 晶莹微星尘 (克制数量，亚像素微尘，拒绝廉价密密麻麻) =================
    const DUST_COUNT = Math.max(60, Math.min(95, Math.floor((width * height) / 9500)));
    const dusts: DustMote[] = [];

    for (let i = 0; i < DUST_COUNT; i++) {
      const isGlint = Math.random() < 0.18; // 18% 亮晶在呼吸峰值绽放微光
      const size = isGlint ? 1.0 + Math.random() * 0.4 : 0.5 + Math.random() * 0.45;
      const baseAlpha = isDark()
        ? (isGlint ? 0.75 : 0.35 + Math.random() * 0.35)
        : (isGlint ? 0.55 : 0.22 + Math.random() * 0.25);

      dusts.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 0.08 + Math.random() * 0.18,
        angle: Math.random() * Math.PI * 2,
        size,
        baseAlpha,
        alpha: baseAlpha,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.01 + Math.random() * 0.02,
        color: palette.dust[Math.floor(Math.random() * palette.dust.length)],
        isGlint,
      });
    }

    // 滚动监听
    let targetScrollY = typeof window !== "undefined" ? window.scrollY : 0;
    let currentScrollY = targetScrollY;
    let prevScrollY = targetScrollY;

    const handleScroll = () => {
      targetScrollY = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    // 鼠标扰动流场
    const mouse = { x: -9999, y: -9999, active: false };
    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = fixed ? e.clientX : e.clientX - canvas.getBoundingClientRect().left;
      mouse.y = fixed ? e.clientY : e.clientY - canvas.getBoundingClientRect().top;
      mouse.active = true;
    };
    const handleMouseLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseleave", handleMouseLeave);

    const updateSize = () => {
      if (!canvas) return;
      width = fixed ? window.innerWidth : (canvas.clientWidth || window.innerWidth);
      height = fixed ? window.innerHeight : (canvas.clientHeight || 600);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };
    window.addEventListener("resize", updateSize);

    // 偶发极简丝线流星
    const meteors: ShootingMeteor[] = [];
    let lastMeteorTime = 0;

    const spawnMeteor = () => {
      const startX = Math.random() * width * 0.75 + width * 0.15;
      const startY = Math.random() * (height * 0.3);
      const angle = Math.PI / 4.2 + (Math.random() - 0.5) * 0.12;
      const speed = 7.5 + Math.random() * 3.5;

      meteors.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: 40 + Math.random() * 35,
        alpha: 0.75,
        decay: 0.018 + Math.random() * 0.01,
      });
    };

    let globalTime = 0;

    // ================= 4. 核心渲染主循环 =================
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      globalTime += 0.016;

      // 滚动差量阻尼
      const scrollDeltaRaw = targetScrollY - currentScrollY;
      currentScrollY += scrollDeltaRaw * 0.12;
      const scrollDelta = currentScrollY - prevScrollY;
      prevScrollY = currentScrollY;

      const dark = isDark();

      // ================= A. 渲染大光圈散斑 (Cinematic Bokeh) =================
      for (let i = 0; i < bokehs.length; i++) {
        const b = bokehs[i];
        b.x += b.vx;
        b.y += b.vy - scrollDelta * 0.12; // 随滚动缓慢漂移
        b.pulsePhase += 0.008;

        if (b.x < -b.radius * 2) b.x = width + b.radius * 2;
        if (b.x > width + b.radius * 2) b.x = -b.radius * 2;
        if (b.y < -b.radius * 2) b.y = height + b.radius * 2;
        if (b.y > height + b.radius * 2) b.y = -b.radius * 2;

        const currentAlpha = b.baseAlpha * (0.8 + 0.3 * Math.sin(b.pulsePhase));

        // 真实光学柔和径向渐变 (边缘 100% 渐隐，绝不生硬)
        const radGrad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
        radGrad.addColorStop(0, `rgba(${b.color}, ${currentAlpha})`);
        radGrad.addColorStop(0.5, `rgba(${b.color}, ${currentAlpha * 0.4})`);
        radGrad.addColorStop(1, `rgba(${b.color}, 0)`);

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = radGrad;
        ctx.fill();
      }

      // ================= B. 偶发发丝流星 =================
      const now = performance.now();
      if (now - lastMeteorTime > 16000 + Math.random() * 9000) {
        lastMeteorTime = now;
        spawnMeteor();
      }

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.alpha -= m.decay;

        if (m.alpha <= 0 || m.x > width + 100 || m.y > height + 100) {
          meteors.splice(i, 1);
          continue;
        }

        const distNorm = Math.hypot(m.vx, m.vy);
        const tailX = m.x - (m.vx / distNorm) * m.len;
        const tailY = m.y - (m.vy / distNorm) * m.len;

        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        grad.addColorStop(0, dark ? "rgba(255, 255, 255, 0)" : "rgba(245, 158, 11, 0)");
        grad.addColorStop(1, dark ? `rgba(255, 255, 255, ${m.alpha * 0.7})` : `rgba(217, 119, 6, ${m.alpha * 0.6})`);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      // ================= C. 渲染流体晶莹微星尘 (Fluid Crystalline Dust) =================
      for (let i = 0; i < dusts.length; i++) {
        const d = dusts[i];

        // 采用低频平滑流体湍流场，粒子呈现如水流般的优雅游弋，绝非机械直线
        const flowNoise = Math.sin(d.x * 0.002 + globalTime * 0.4) + Math.cos(d.y * 0.002 + globalTime * 0.3);
        const currentAngle = d.angle + flowNoise * 0.35;

        d.x += Math.cos(currentAngle) * d.speed;
        d.y += Math.sin(currentAngle) * d.speed - scrollDelta * 0.22;

        // 鼠标流体微排斥 (水流避让效果，轻柔顺滑)
        if (mouse.active) {
          const dx = d.x - mouse.x;
          const dy = d.y - mouse.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 110 && dist > 1) {
            const force = (110 - dist) / 110;
            d.x += (dx / dist) * force * 0.6;
            d.y += (dy / dist) * force * 0.6;
          }
        }

        // 环绕回折
        if (d.x < -15) d.x = width + 15;
        if (d.x > width + 15) d.x = -15;
        if (d.y < -20) d.y = height + 20;
        if (d.y > height + 20) d.y = -20;

        // 自然平滑正弦明灭
        d.twinklePhase += d.twinkleSpeed;
        const twinkle = Math.sin(d.twinklePhase);
        d.alpha = Math.max(0.06, Math.min(0.95, d.baseAlpha + twinkle * 0.28));

        // 绘制微粒圆核
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.color}, ${d.alpha})`;
        ctx.fill();

        // 峰值微芒 (仅当亮星呼吸到 > 0.8 时，绽放极其极其纤细的 4 角高雅反光，长仅 3px)
        if (d.isGlint && d.alpha > 0.75) {
          const flareAlpha = (d.alpha - 0.75) * 2.2;
          const flareLen = 2.8 + d.size;

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(d.x - flareLen, d.y);
          ctx.lineTo(d.x + flareLen, d.y);
          ctx.moveTo(d.x, d.y - flareLen);
          ctx.lineTo(d.x, d.y + flareLen);
          ctx.strokeStyle = dark
            ? `rgba(255, 255, 255, ${flareAlpha * 0.7})`
            : `rgba(${d.color}, ${flareAlpha * 0.6})`;
          ctx.lineWidth = 0.45;
          ctx.stroke();
          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [fixed]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={
        fixed
          ? "pointer-events-none fixed inset-0 z-0 h-full w-full opacity-90 transition-opacity duration-700"
          : "pointer-events-none absolute inset-0 z-0 h-full w-full opacity-90 transition-opacity duration-700"
      }
    />
  );
}
