/**@type {HTMLCanvasElement}*/
const canvas = glcanvas;

const gl = canvas.getContext("webgl");


const root = document.querySelector("html");
function resizeCanvas() {
    canvas.width = root.clientWidth;
    canvas.height = root.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}

resizeCanvas();
addEventListener('resize', resizeCanvas);

window.onload = () => {
    clearScene();
    draw();
}

function clearScene() {
    //opaque
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    //Clear color buffer
    gl.clear(gl.COLOR_BUFFER_BIT);
}

function getUniforms(program, names) {
    let uniforms = {}
    for (const n of names) uniforms[n] = gl.getUniformLocation(program, n);
    return uniforms
}

function getAttributes(program, names) {
    let attribs = {}
    for (const n of names) attribs[n] = gl.getAttribLocation(program, n);
    return attribs
}

function hexToRGBA(hex) {
    const vals = [];
    for (let i = 0; i < 3; ++i) {
        vals[i] = parseInt(hex.slice(i*2+1, i*2+3), 16) / 0xFF;
    }
    vals[3] = 1.0;
    return vals;
}

// language=GLSL
const vsSource =
`
    attribute vec4 vertexPosition;
    uniform float time;
    uniform float outerRadius;
    uniform vec2 view;
    uniform vec2 rad; // [min, max]
    uniform vec2 pos;

    //TODO: move some calculations out of fragment shader into here and then pass to fragment shader as "varying"?
    
    void main() {
        gl_Position = vertexPosition;
    }
`;

// Is there a better place to put shader code?
// Can I put it in a separate file and read it from JS?

// language=GLSL
const fsSource =
`
    precision highp float;

    uniform vec2 pos;
    uniform vec2 rad; // [min, max]
    uniform float time;
    uniform float spinSpeed;
    
    uniform float outerRadius;

    uniform float numCircles;

    uniform float sizeSpotChange;
    
    uniform vec4 colorA;
    uniform vec4 colorB;
    
    uniform float colorMod;

    float dist;

    vec4 background = vec4(1.0, 1.0, 1.0, 1.);

    //Consider using distanceSquared instead of distance for efficiency
    float distanceSquared(vec2 a, vec2 b) {
        float x = a.x - b.x;
        float y = a.y - b.y;
        return x*x + y*y;
    }

    // Why is this not built-in :|
    const float PI = 3.14159265358979;

    const float MAX_CIRCLES = 20.0;

    vec2 aroundCircle(float percent, float radius) {
        return vec2(cos(2.0*PI * percent), sin(2.0*PI * percent)) * radius;
    }
    
    // this is what this looks like on desmos
    // https://www.desmos.com/calculator/z6lbe85x2o
    // awful function name
    float smoothify(float x, float mod) {
        return (cos(2. * PI * x + mod) + 1.) / 2.;
    }
    
    void main() {
        gl_FragColor = background;
        
        for (float i = 0.0; i < MAX_CIRCLES; ++i) { // GLSL requires a constant max iterations
            if (i >= numCircles) break; // but we can break early
            float percentCircle = i/numCircles + time * spinSpeed;
            // absolute value cosine wave scrunched to be between [0.4, 1] multiplied by constant radius
            // factoring in time in addition to where it is along the circle 
            // means the places where blobs have high or low sizes are changing
            float r = mix(rad[0], rad[1], smoothify(percentCircle, 2.0*time));
            if ((dist = distance(gl_FragCoord.xy, pos + aroundCircle(percentCircle, outerRadius))) < r) {
                gl_FragColor *= mix(mix(colorA, colorB, smoothify(percentCircle, -2.0*time)), background, dist / r);
                // overlapping colors stack multiplicatavely
            }
        }
    }
`
// too long and does too many things -- I should split this up
function draw() {
    const MAX_CIRCLES = 20

    const program = initShaderProgram(vsSource, fsSource);

    const uniforms = getUniforms(program, ['pos', 'rad', 'time','spinSpeed', 'outerRadius', 'numCircles', 'view', 'colorA', 'colorB']);
    const attributes = getAttributes(program, ['vertexPosition']);

    gl.useProgram(program);

    let spinSpeed;
    let numCircles = 1;
    let outerRadius;
    let circleRadius;
    let outerRadiusMod = 0.2;

    ///// hook up inputs to variables ///////

    spinSpeedInput.oninput = () => {
        gl.uniform1f(uniforms.spinSpeed, spinSpeed = spinSpeedInput.value);
    }
    spinSpeedInput.oninput();

    colorAInput.oninput = () => {
        // "...array" splits array into arguments!
        gl.uniform4f(uniforms.colorA, ...hexToRGBA(colorAInput.value));
    }
    colorAInput.oninput();

    colorBInput.oninput = () => {
        gl.uniform4f(uniforms.colorB, ...hexToRGBA(colorBInput.value));
    }
    colorBInput.oninput();

    numCirclesInput.oninput = () => {
        gl.uniform1f(uniforms.numCircles, numCircles = numCirclesInput.value);
    }
    numCirclesInput.oninput();

    let circleRadiusModMin;
    let circleRadiusModMax;
    circleMinRadiusInput.oninput = () => {
        circleRadiusModMin = circleMinRadiusInput.value;
        calcRelativeSizes();
    }
    circleMaxRadiusInput.oninput = () => {
        circleRadiusModMax = circleMaxRadiusInput.value;
        calcRelativeSizes();
    }

    outerRadiusInput.oninput = () => {
        outerRadiusMod = outerRadiusInput.value;
        calcRelativeSizes();
    }

    function calcRelativeSizes() {
        gl.uniform2f(uniforms.view, canvas.width, canvas.height);
        dcx = canvas.width / 5;
        dcy = canvas.height / 7;
        cx = canvas.width / 2;
        cy = canvas.height / 2;
        outerRadius = Math.min(canvas.width, canvas.height) * outerRadiusMod;
        gl.uniform1f(uniforms.outerRadius, outerRadius);
        circleRadius = {min: outerRadius * circleRadiusModMin, max: outerRadius * circleRadiusModMax};
        gl.uniform2f(uniforms.rad, circleRadius.min, circleRadius.max);
    }

    ////////////////////////////////////////

    const ENABLE_MOVING_CENTER = false;

    let r = 0;
    let dr = 2;

    let colorMod = 0;

    let cx = canvas.width / 2;
    let cy = canvas.height / 2;
    let dcx = 1;
    let dcy = 1;

    circleMinRadiusInput.oninput();
    circleMaxRadiusInput.oninput();
    outerRadiusInput.oninput();

    calcRelativeSizes()
    addEventListener("resize", calcRelativeSizes);

    let prev;
    function update(timestamp) {
        const dt = (timestamp - prev) / 1000;
        prev = timestamp;

        if (ENABLE_MOVING_CENTER) {
            const nextcx = cx + dcx * dt;
            if (nextcx + outerRadius + circleRadius.min > canvas.width || nextcx < outerRadius + circleRadius.min) dcx = -dcx;
            else cx = nextcx;

            const nextcy = cy + dcy * dt;
            if (nextcy + outerRadius + circleRadius.min > canvas.height || nextcy < outerRadius + circleRadius.min) dcy = -dcy;
            else cy = nextcy;
        }
        gl.uniform2f(uniforms.pos, cx, cy);

        gl.uniform1f(uniforms.time, timestamp / 1000);

        drawScene(attributes, initBuffers());
        requestAnimationFrame(update);
    }
    //For the furst update frame I set the `prev` variable so it isn't undefined
    requestAnimationFrame(timestamp => {
        prev = timestamp;
        update(timestamp);
    });
}

function initBuffers() {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const positions = [
        1, 1,
        -1, 1,
        1, -1,
        -1, -1
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    return {
        position: positionBuffer,
    };
}


// a lot of boilerplate
// followed tutorial at 

function drawScene(attributes, buffers) {
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    //full clear
    gl.clearDepth(1.0);
    //enable depth testing 
    gl.enable(gl.DEPTH_TEST);
    //close obscures far
    gl.depthFunc(gl.LEQUAL);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(attributes.vertexPosition, numComponents, type, normalize, stride, offset);
        
        gl.enableVertexAttribArray(attributes.vertexPosition);
    }


    {
        const offset = 0;
        const vertexCount = 4;
        gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
    }
}

function loadShader(typeName, source) {
    const shader = gl.createShader(gl[typeName]);

    //Send source to shader object
    gl.shaderSource(shader, source);

    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`Compiling shader (${typeName}): ${gl.getShaderInfoLog(shader)}`);
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function initShaderProgram(vsSource, fsSource) {
    const vertexShader = loadShader('VERTEX_SHADER', vsSource);
    const fragmentShader = loadShader('FRAGMENT_SHADER', fsSource);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error("Unable to initalize the shader program: " + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    

    return shaderProgram;
}
