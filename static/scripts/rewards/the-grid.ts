export function grid(node = document.body) {
  // Create canvas and WebGL context
  const canvas = document.createElement("canvas");
  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  node.appendChild(canvas);

  const gl = canvas.getContext("webgl") as WebGLRenderingContext;

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

  // Define shader creation function
  function createShader(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) {
      console.error("An error occurred creating the shaders");
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  // Create vertex and fragment shaders
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  if (!vertexShader) {
    console.error("An error occurred creating the vertex shader");
    return;
  }
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!fragmentShader) {
    console.error("An error occurred creating the fragment shader");
    return;
  }

  // Create program, attach shaders, and link
  const program = gl.createProgram();
  if (!program) {
    console.error("An error occurred creating the program");
    return;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  // Verify program link status
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Unable to initialize the shader program: " + gl.getProgramInfoLog(program));
    return;
  }

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

  // Resize function
  function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
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

  // Render function
  function render() {
    resizeCanvasToDisplaySize(canvas); // Check and update canvas size each frame

    // Update resolution uniform
    gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Update time uniform
    gl.uniform1f(timeUniformLocation, performance.now() / 1000.0);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Request next frame
    requestAnimationFrame(render);
  }

  // Handle window resize
  window.addEventListener("resize", () => {
    resizeCanvasToDisplaySize(canvas);
  });

  // Start the render loop
  render();
}
