"use client";
import React, { useEffect, useRef } from "react";

export function GridBackground({ children }: { children: React.ReactNode }) {
  const canvasRef: React.RefObject<HTMLCanvasElement> = useRef(null);
  if (typeof document === "undefined") return null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let node;
    if (document.body) {
      node = document.getElementById("grid");
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;

    const gl = canvas.getContext("webgl");
    if (!gl) {
      console.error("Unable to initialize WebGL. Your browser may not support it.");
      return;
    }

    // Create canvas and WebGL context
    node?.appendChild(canvas);

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Define shader sources
    const vertexShaderSource = `
   attribute vec2 a_position;

   void main() {
       gl_Position = vec4(a_position, 0, 1);
   }
`;

    // cspell:ignore mediump
    const fragmentShaderSource = `
   precision mediump float;

   uniform vec2 u_resolution;
   uniform float u_time;

   float rand(vec2 n) {
       return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
   }

   void main() {
       vec3 color = vec3(128.0/255.0, 128.0/255.0, 128.0/255.0); // #808080
       vec2 tilePosition = mod(gl_FragCoord.xy, 24.0);
       vec2 tileNumber = floor(gl_FragCoord.xy / 24.0);

       float period = rand(tileNumber) * 9.0 + 1.0; // Random value in the range [1, 10]
       float phase = fract(u_time / period / 8.0); // Animation eight times slower
       float opacity = (1.0 - abs(phase * 2.0 - 1.0)) * 0.125; // Limit maximum opacity to 0.25

       vec4 backgroundColor = vec4(color, opacity);

       if (tilePosition.x > 23.0 && tilePosition.y < 1.0) {
         gl_FragColor = vec4(color, 1.0); // Full opacity for the dot
     } else {
         gl_FragColor = backgroundColor;
     }
   }
`;

    function initializeShaders(gl: WebGLRenderingContext | WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

      const program = createProgram(gl, vertexShader, fragmentShader);
      if (!program) throw new Error("Program initialization failed");

      return program;
    }

    function createShader(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) {
        console.error("Creating shader failed");
        return null;
      }
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    function createProgram(gl: WebGLRenderingContext | WebGL2RenderingContext, vertexShader: WebGLShader | null, fragmentShader: WebGLShader | null) {
      const program = gl.createProgram();
      if (!program) {
        console.error("Creating program failed");
        return null;
      }

      if (!vertexShader || !fragmentShader) {
        console.error("No shaders provided");
        return null;
      }

      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(`Program link error: ${gl.getProgramInfoLog(program)}`);
        gl.deleteProgram(program);
        return null;
      }
      return program;
    }

    const program = initializeShaders(gl, vertexShaderSource, fragmentShaderSource);
    if (!program) return;
    // Use the program
    gl.useProgram(program);

    // Get location of time and resolution uniforms
    const timeUniformLocation = gl.getUniformLocation(program, "u_time");
    const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");

    // Bind the position buffer and set attribute pointer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    setupRenderLoop(canvas, gl, program, timeUniformLocation, resolutionUniformLocation);

    function setupRenderLoop(
      canvas: HTMLCanvasElement,
      gl: WebGL2RenderingContext | WebGLRenderingContext,
      program: WebGLProgram | null,
      timeUniformLocation: WebGLUniformLocation | null,
      resolutionUniformLocation: WebGLUniformLocation | null
    ) {
      function render() {
        resizeCanvasToDisplaySize(canvas, gl); // Check and update canvas size each frame

        gl.useProgram(program); // Ensure the correct program is active

        // Clear the canvas
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Set time uniform
        gl.uniform1f(timeUniformLocation, performance.now() / 1000);
        // Set resolution uniform
        gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);

        // Draw the rectangle
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Request next frame
        requestAnimationFrame(render);
      }

      requestAnimationFrame(render);
    }
    window.addEventListener("resize", () => handleResize(canvas, gl));
    document.body.classList.add("grid-loaded");

    return () => {
      window.removeEventListener("resize", () => handleResize(canvas, gl));
    };
  }, []);

  function handleResize(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    if (!canvas) return;
    if (!gl) return;

    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    // Update WebGL viewport and possibly other uniforms here...
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
    if (!canvas) return;
    if (!gl) return;

    // Lookup the size the browser is displaying the canvas.
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    // Check if the canvas is not the same size.
    if (canvas.width != displayWidth || canvas.height != displayHeight) {
      // Make the canvas the same size
      canvas.width = displayWidth;
      canvas.height = displayHeight;

      // Update WebGL viewport to match
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  return (
    <div id="background">
      <div className="gradient"></div>
      <div className="gradient"></div>
      <div id="grid">
        <canvas ref={canvasRef}></canvas>
      </div>
      {children}
    </div>
  );
}
