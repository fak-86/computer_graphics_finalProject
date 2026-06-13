
var VSHADER_SOURCE_REFLECT = `
    attribute vec4 a_Position;
    attribute vec4 a_Normal;
    uniform mat4 u_MvpMatrix;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_normalMatrix;
    varying vec3 v_Normal;
    varying vec3 v_PositionInWorld;
    void main(){
        gl_Position = u_MvpMatrix * a_Position;
        v_PositionInWorld = (u_modelMatrix * a_Position).xyz; 
        v_Normal = normalize(vec3(u_normalMatrix * a_Normal));
    }    
`;

var FSHADER_SOURCE_REFLECT = `
    precision mediump float;
    uniform vec3 u_ViewPosition;
    uniform samplerCube u_envCubeMap; // 動態環境貼圖
    varying vec3 v_Normal;
    varying vec3 v_PositionInWorld;
    void main(){
        vec3 V = normalize(u_ViewPosition - v_PositionInWorld); 
        vec3 normal = normalize(v_Normal);
        
        // 同時計算反射與折射，並做 50% 混合，效果最逼真
        vec3 R_reflect = reflect(-V, normal);
        vec3 R_refract = refract(-V, normal, 1.00 / 1.15); // 玻璃折射率
        
        vec3 colorReflect = textureCube(u_envCubeMap, R_reflect).rgb;
        vec3 colorRefract = textureCube(u_envCubeMap, R_refract).rgb;
        
        gl_FragColor = vec4(mix(colorRefract, colorReflect, 0.5), 1.0);
    }
`;
var programReflect;
var reflectObjComponents = [];
var reflectObjRotateAngle = 0;
var isReflectCubeLoaded = false;
var reflectCubeX=0,reflectCubeY=0,reflectCubeZ=0;
var reflectCube_scale=0.2;

var dynamicEnvFbo;
var dynamicEnvTexSize = 512;

var cubeFaces = [
  { target: 0, at: [ 1, 0, 0], up: [0,-1, 0] }, // +X
  { target: 1, at: [-1, 0, 0], up: [0,-1, 0] }, // -X
  { target: 2, at: [ 0, 1, 0], up: [0, 0, 1] }, // +Y
  { target: 3, at: [ 0,-1, 0], up: [0, 0,-1] }, // -Y
  { target: 4, at: [ 0, 0, 1], up: [0,-1, 0] }, // +Z
  { target: 5, at: [ 0, 0,-1], up: [0,-1, 0] }  // -Z
];

async function initOnlyReflectiveCube(gl) {
    programReflect = compileShader(gl, VSHADER_SOURCE_REFLECT, FSHADER_SOURCE_REFLECT);
    programReflect.a_Position = gl.getAttribLocation(programReflect, 'a_Position'); 
    programReflect.a_Normal = gl.getAttribLocation(programReflect, 'a_Normal'); 
    programReflect.u_MvpMatrix = gl.getUniformLocation(programReflect, 'u_MvpMatrix'); 
    programReflect.u_modelMatrix = gl.getUniformLocation(programReflect, 'u_modelMatrix'); 
    programReflect.u_normalMatrix = gl.getUniformLocation(programReflect, 'u_normalMatrix');
    programReflect.u_ViewPosition = gl.getUniformLocation(programReflect, 'u_ViewPosition');
    programReflect.u_envCubeMap = gl.getUniformLocation(programReflect, 'u_envCubeMap');

    dynamicEnvFbo = gl.createFramebuffer();
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    for (var i = 0; i < 6; i++) {
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, 
                      dynamicEnvTexSize, dynamicEnvTexSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    dynamicEnvFbo.texture = texture;

    var renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, dynamicEnvTexSize, dynamicEnvTexSize);
    dynamicEnvFbo.renderbuffer = renderbuffer;

    try {
        let response = await fetch('cube.obj');
        let text = await response.text();
        let obj = parseOBJ(text);
        for (let i = 0; i < obj.geometries.length; i++) {
            let o = initVertexBufferForLaterUse(gl, 
                obj.geometries[i].data.position, obj.geometries[i].data.normal, obj.geometries[i].data.texcoord
            );
            reflectObjComponents.push(o);
        }
        isReflectCubeLoaded = true;
        console.log("折射水晶模型 cube.obj 載入成功！");
    } catch (e) {
        console.error("模型載入失敗:", e);
    }
}

function updateDynamicEnvMap(gl, platform_model, platformModelMatrix, platformMvpFromLight, player, skybox_draw) {
    if (!isReflectCubeLoaded) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, dynamicEnvFbo);
    gl.viewport(0, 0, dynamicEnvTexSize, dynamicEnvTexSize);
    
    // 水晶核心位置 (0, 6, 0)
    var cx = 0.0, cy = 6.0, cz = 0.0; 
    var projMatrix = new Matrix4();
    projMatrix.setPerspective(90, 1.0, 0.1, 100.0);

    for (var i = 0; i < 6; i++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, dynamicEnvFbo.texture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dynamicEnvFbo.renderbuffer);

        gl.clearColor(0.2, 0.2, 0.2, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        var face = cubeFaces[i];
        var viewMatrix = new Matrix4();
        viewMatrix.lookAt(cx, cy, cz, cx + face.at[0], cy + face.at[1], cz + face.at[2], face.up[0], face.up[1], face.up[2]);
        var vpMatrix = new Matrix4(projMatrix).multiply(viewMatrix);

        var viewMatrixForSkybox = new Matrix4(viewMatrix);
        viewMatrixForSkybox.elements[12] = 0; viewMatrixForSkybox.elements[13] = 0; viewMatrixForSkybox.elements[14] = 0;
        var vpFromCameraInverse = new Matrix4(projMatrix).multiply(viewMatrixForSkybox).invert();
        skybox_draw(vpFromCameraInverse);

        drawObjectsOnScreen(platform_model, vpMatrix, platformModelMatrix, platformMvpFromLight, cx, cy, cz, false);
        playerDraw_onsreen(player, vpMatrix, cx, cy, cz);
        enemyDraw_onscreen(vpMatrix, cx, cy, cz);
    }
}

function drawOnlyReflectiveCube(gl, vpForModel) {
    if (!isReflectCubeLoaded) return; 

    gl.useProgram(programReflect);
    gl.depthFunc(gl.LESS);

    var reflectModelMatrix = new Matrix4();
    reflectModelMatrix.translate(reflectCubeX, reflectCubeY, reflectCubeZ); 
    reflectModelMatrix.scale(reflectCube_scale, reflectCube_scale, reflectCube_scale);
    reflectModelMatrix.rotate(reflectObjRotateAngle, 1, 1, 1);

    var reflectMvpMatrix = new Matrix4(vpForModel).multiply(reflectModelMatrix);
    var reflectNormalMatrix = new Matrix4();
    reflectNormalMatrix.setInverseOf(reflectModelMatrix);
    reflectNormalMatrix.transpose();

    gl.activeTexture(gl.TEXTURE3); 
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, dynamicEnvFbo.texture);
    gl.uniform1i(programReflect.u_envCubeMap, 3);

    gl.uniform3f(programReflect.u_ViewPosition, currentCamX, currentCamY, currentCamZ);
    gl.uniformMatrix4fv(programReflect.u_MvpMatrix, false, reflectMvpMatrix.elements);
    gl.uniformMatrix4fv(programReflect.u_modelMatrix, false, reflectModelMatrix.elements);
    gl.uniformMatrix4fv(programReflect.u_normalMatrix, false, reflectNormalMatrix.elements);

    for (let i = 0; i < reflectObjComponents.length; i++) {
        initAttributeVariable(gl, programReflect.a_Position, reflectObjComponents[i].vertexBuffer);
        initAttributeVariable(gl, programReflect.a_Normal, reflectObjComponents[i].normalBuffer);
        gl.drawArrays(gl.TRIANGLES, 0, reflectObjComponents[i].numVertices);
    }
}