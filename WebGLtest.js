var VSHADER_SOURCE = `
    attribute vec4 a_Position;
    attribute vec4 a_Normal;
    attribute vec2 a_TexCoord;
    attribute vec3 a_Tangent;
    attribute vec3 a_Bitangent;
    attribute float a_crossTexCoord;

    uniform mat4 u_MvpMatrix;
    uniform mat4 u_modelMatrix;
    uniform mat4 u_normalMatrix;
    uniform mat4 u_ProjMatrixFromLight;
    uniform mat4 u_MvpMatrixOfLight;

    varying vec4 v_PositionFromLight;
    varying vec3 v_Normal;
    varying vec3 v_PositionInWorld;
    varying vec2 v_TexCoord;
    varying mat4 v_TBN;

    void main(){
        gl_Position = u_MvpMatrix * a_Position;
        v_PositionInWorld = (u_modelMatrix * a_Position).xyz; 
        v_Normal = normalize(vec3(u_normalMatrix * a_Normal));
        v_TexCoord = a_TexCoord;
        v_PositionFromLight = u_MvpMatrixOfLight * a_Position;

        vec3 tangent = normalize(a_Tangent);
        vec3 bitangent = normalize(a_Bitangent);
        vec3 nVector;
        if(a_crossTexCoord > 0.0){
            nVector = cross(tangent, bitangent);
        } else {
            nVector = cross(bitangent, tangent);
        }
        v_TBN = mat4(tangent.x, tangent.y, tangent.z, 0.0, 
                     bitangent.x, bitangent.y, bitangent.z, 0.0,
                     nVector.x, nVector.y, nVector.z, 0.0, 
                     0.0, 0.0, 0.0, 1.0);
    }    
`;

var FSHADER_SOURCE = `
    precision mediump float;

    uniform vec3 u_LightPosition;      
    uniform vec3 u_RimLightPosition;   
    uniform vec3 u_RimLightColor;      
    uniform vec3 u_ViewPosition;       
    uniform float u_Ka;
    uniform float u_Kd;
    uniform vec3 u_Color;
    uniform float u_Ks;
    uniform float u_shininess;
    uniform float u_UseTex;
    uniform sampler2D u_Sampler;
    uniform sampler2D u_ShadowMap;

    uniform sampler2D u_NormalMap;
    uniform bool u_UseNormalMap;
    uniform highp mat4 u_normalMatrix;
    uniform int u_IsHit;

    varying vec3 v_Normal;
    varying vec3 v_PositionInWorld;
    varying vec4 v_PositionFromLight;
    varying vec2 v_TexCoord;
    varying mat4 v_TBN;

    void main(){
        vec4 texColor = texture2D(u_Sampler, v_TexCoord);
        vec3 baseColor = (u_UseTex > 0.5) ? texColor.rgb : u_Color;

        vec3 normal;
        if (u_UseNormalMap) {
            vec3 nMapNormal = normalize(texture2D(u_NormalMap, v_TexCoord).rgb * 2.0 - 1.0);
            normal = normalize(vec3(u_normalMatrix * v_TBN * vec4(nMapNormal, 0.0)));
        } else {
            normal = normalize(v_Normal);
            if (length(normal) < 0.1) {
                normal = vec3(0.0, 1.0, 0.0); 
            }
        }

        vec3 viewDirection = normalize(u_ViewPosition - v_PositionInWorld);

        vec3 lightDirection = normalize(u_LightPosition - v_PositionInWorld);
        float nDotL = max(dot(normal, lightDirection), 0.0);
        
        vec3 shadowCoord = (v_PositionFromLight.xyz / v_PositionFromLight.w) * 0.5 + 0.5;
        float shadowFactor = 1.0;
        if(shadowCoord.z >= 0.0 && shadowCoord.z <= 1.0){
            float depthInShadowMap = texture2D(u_ShadowMap, shadowCoord.xy).r; 
            if(shadowCoord.z > depthInShadowMap + 0.005){
                shadowFactor = 0.1; 
            }
        }
        vec3 diffuse = u_Kd * baseColor * nDotL * shadowFactor;

        vec3 rimLightDir = normalize(u_RimLightPosition - v_PositionInWorld);
        float rimFactor = 1.0 - max(dot(normal, viewDirection), 0.0);
        rimFactor = pow(rimFactor, 4.0); 
        float rimVisible = max(dot(normal, rimLightDir), 0.0);
        vec3 rimLightResult = u_RimLightColor * rimFactor * rimVisible;

        vec3 ambient = u_Ka * baseColor;
        vec3 finalColor = ambient + diffuse + rimLightResult;

        gl_FragColor = vec4(finalColor, 1.0);
        if(u_IsHit == 1){
            gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.0, 0.0), 0.7);
        }
    }    
`;

var VSHADER_SHADOW_SOURCE = `
      attribute vec4 a_Position;
      uniform mat4 u_MvpMatrix;
      void main(){
          gl_Position = u_MvpMatrix * a_Position;
      }
  `;

var FSHADER_SHADOW_SOURCE = `
      precision mediump float;
      void main(){
        gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
      }
  `;

const bgm = {
    menu: new Audio('./sounds/menu_bgm.mp3'),
    battle: new Audio('./sounds/battle_bgm.mp3')
};

bgm.menu.loop = true;
bgm.menu.volume = 0.4; 
bgm.battle.loop = true;
bgm.battle.volume = 0.5;
firstClick=false;

function playMenuBGM() {
    bgm.battle.pause();
    bgm.battle.currentTime = 0;
    bgm.menu.play().catch(e => {
        console.log("主選單音樂播放被瀏覽器阻擋，等待玩家點擊畫面後自動重試...", e);
    });
}

function playBattleBGM() {
    bgm.menu.pause();
    bgm.menu.currentTime = 0;
    
    bgm.battle.play().catch(e => {
        console.log("戰鬥音樂播放失敗（可能尚未與網頁互動）：", e);
    });
}

function stopAllBGM() {
    bgm.menu.pause();
    bgm.menu.currentTime = 0;
    bgm.battle.pause();
    bgm.battle.currentTime = 0;
}

var canvas, gl;
var shadowProgram, program;

var playerX = 0.0, playerY = 3.6, playerZ = 10.0;
let player={
    body: null,
    leftFrontArm: null,
    leftArm: null,
    leftHand: null,
    rightFrontArm: null,
    rightArm: null,
    rightHand: null,
    body_Angle: {x:-20,y:0,z:0},
    body_Matrix: new Matrix4(),
    body_MvpFromLight: new Matrix4(),
    leftArm_Angle: {x:140,y:200,z:-60},
    leftArm_Matrix: new Matrix4(),
    leftArm_MvpFromLight: new Matrix4(),
    leftFrontArm_Angle: {x:-15,y:45,z:0},
    leftFrontArm_Matrix: new Matrix4(),
    leftFrontArm_MvpFromLight: new Matrix4(),
    leftHand_Angle:{x:0,y:30,z:0},
    leftHand_Matrix: new Matrix4(),
    leftHand_MvpFromLight: new Matrix4(),
    rightArm_Angle:{x:180,y:0,z:-90},
    rightArm_Matrix: new Matrix4(),
    rightArm_MvpFromLight: new Matrix4(),
    rightFrontArm_Angle:{x:15,y:0,z:0},
    rightFrontArm_Matrix: new Matrix4(),
    rightFrontArm_MvpFromLight: new Matrix4(),
    rightHand_Angle:{x:0,y:120,z:10},
    rightHand_Matrix: new Matrix4(),
    rightHand_MvpFromLight: new Matrix4(),
    rotateX:true,
    isHit : false,
    hitTimer : 0,
};
var isAttacking = false;
var attackPhase = 'NONE'; // 可為：'NONE', 'START', 'END', 'RECOVER','START2','RECOVER2'
var freezeCounter = 0; // 用來記錄目前已經停頓了幾幀
let poses={
    IDLE:{
        body: {x:10,y:0,z:0},
        leftArm: {x:180,y:160,z:-20},
        leftFrontArm: {x:-15,y:45,z:0},
        leftHand: {x:0,y:30,z:0},
        rightArm: {x:180,y:0,z:-50},
        rightFrontArm: {x:15,y:30,z:0},
        rightHand:{x:0,y:60,z:10}
    },
    MOVE_F:{
        body: {x:-10,y:0,z:0},
        leftArm: {x:160,y:120,z:-80},
        leftFrontArm: {x:-85,y:10,z:5},
        leftHand: {x:0,y:30,z:0},
        rightArm: {x:180,y:-30,z:-50},
        rightFrontArm: {x:15,y:30,z:0},
        rightHand:{x:0,y:60,z:10}
    },
    MOVE_B:{
        body: {x:20,y:0,z:0},
        leftArm: {x:160,y:160,z:-60},
        leftFrontArm: {x:-15,y:45,z:0},
        leftHand: {x:0,y:30,z:0},
        rightArm: {x:180,y:40,z:-50},
        rightFrontArm: {x:15,y:30,z:0},
        rightHand:{x:0,y:60,z:30}
    },
    ATTACK1_START:{
        body: {x:10,y:0,z:0},
        leftArm: {x:180,y:160,z:-20},
        leftFrontArm: {x:-30,y:45,z:0},
        leftHand: {x:0,y:30,z:0},
        rightArm: {x:370,y:0,z:-50},
        rightFrontArm: {x:15,y:30,z:0},
        rightHand:{x:0,y:60,z:10}
    },
    ATTACK1_END:{
        body: {x:-5,y:0,z:0},
        leftArm: {x:160,y:160,z:-20},
        leftFrontArm: {x:0,y:45,z:0},
        leftHand: {x:0,y:30,z:0},
        rightArm: {x:220,y:0,z:30},
        rightFrontArm: {x:15,y:30,z:0},
        rightHand:{x:0,y:60,z:0}
    },
    ATTACK2_START:{
        body: {x:-5,y:0,z:0},
        leftArm: {x:160,y:160,z:-20},
        leftFrontArm: {x:0,y:45,z:0},
        leftHand: {x:0,y:30,z:0},
        rightArm: {x:220,y:0,z:30},
        rightFrontArm: {x:15,y:30,z:0},
        rightHand:{x:0,y:60,z:0}
    },
    ATTACK2_END:{
        body: {x:-10,y:0,z:0},
        leftArm: {x:180,y:160,z:-20},
        leftFrontArm: {x:-15,y:45,z:0},
        leftHand: {x:0,y:30,z:0},
        rightArm: {x:270,y:0,z:-20},
        rightFrontArm: {x:15,y:0,z:0},
        rightHand:{x:0,y:60,z:10}
    },
    END:{
        body: {x:10,y:0,z:0},
        leftArm: {x:110,y:160,z:-20},
        leftFrontArm: {x:-15,y:45,z:0},
        leftHand: {x:0,y:0,z:0},
        rightArm: {x:180,y:0,z:-20},
        rightFrontArm: {x:15,y:30,z:0},
        rightHand:{x:0,y:60,z:10}
    },
}

var cameraDistance = 5;// 相機距離角色的距離
var currentCamX,currentCamY,currentCamZ;

var angleX = 0.0, angleY = 0.0; // 當前的旋轉角度（左右、上下）
var mouseX = 0.0, mouseY = 0.0; // 目前滑鼠的畫布相對座標
const DEADZONE = 50;         // 中央死區大小（像素）。滑鼠距離中心 50px 內，視角完全不動
const ROTATE_DAMPING = 0.005; // 阻尼/靈敏度係數。數值越小，轉動越慢

var lightX = 0, lightY = 10, lightZ = 5;
var RimLightX = -30.0, RimLightY = 5.0, RimLightZ = 10.0;
var offScreenWidth = 2048, offScreenHeight = 2048;

var fbo;
var cubeMapTex;

var platform_model;

var keysPressed = {};

var playerDone=false,enemyDone=false;

var playerMaxHp = 100, playerHp = 100;
var enemyMaxHp = 150, enemyHp = 150;

player.isHit = false;
player.hitTimer = 0;
if (typeof enemy !== 'undefined') {
    enemy.isHit = false;
    enemy.hitTimer = 0;
}

var playerHasDealtDamage = false;
var enemyHasDealtDamage = false;
var isGameOver = false;           // 控制更新停止
var isWinning = false;
let winAnimation={
    lookat:{x:0,y:0,z:0},
    check1:false,
    check2:false,
    check3:false,
    check4:false,
    check5:false,
    check6:false,
    check7:false,
    counter:0
}

async function main(){
    canvas = document.getElementById('webgl');
    gl = canvas.getContext('webgl2');
    if(!gl){
        console.log('Failed to get the rendering context for WebGL');
        return ;
    }
    
    //inite skybox
    skybox_init();
    await initOnlyReflectiveCube(gl);
    setup_program();
    setup_shadowProgram();
    gl.useProgram(program);
    
    platform_model = await loadModel('./platform/G.obj', './platform/G.mtl');
    playerFetch(player);
    enemyFetch();

    fbo = initFrameBuffer(gl);

    draw();
    
    document.addEventListener('keydown', (event) => {
        if(isWinning){
            return;
        }
        keysPressed[event.key.toLowerCase()] = true; 
    });
    document.addEventListener('keyup', (event) => {
        if(isWinning){
            return;
        }
        keysPressed[event.key.toLowerCase()] = false;
    });
    
    canvas.onwheel = function(event) {
        if(isWinning){
            return;
        }
        event.preventDefault();

        const zoomSpeed = 0.05; 

        if (event.deltaY > 0) {
            cameraDistance += zoomSpeed * 10; 
        } else {
            cameraDistance -= zoomSpeed * 10;
        }

        if (cameraDistance < 2.0)  cameraDistance = 2.0;
        if (cameraDistance > 10.0) cameraDistance = 10.0;

        let radMaxAngle = (angleX * Math.PI) / 180;
        let radMinAngle = (angleY * Math.PI) / 180;
        
        currentCamX = playerX + cameraDistance * Math.cos(radMinAngle) * Math.sin(radMaxAngle);
        currentCamY = playerY + cameraDistance * Math.sin(radMinAngle);
        currentCamZ = playerZ + cameraDistance * Math.cos(radMinAngle) * Math.cos(radMaxAngle);

        draw(); 
    };
    canvas.addEventListener('mousemove', function(event) {
        if(isWinning){
            return;
        }
		const rect = canvas.getBoundingClientRect();
    
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;
        
        mouseX = currentX - (canvas.width / 2);
        
        mouseY = (canvas.height / 2) - currentY; 
        //console.log(`width: ${canvas.width}, height: ${canvas.height}`);
        //console.log(`Mouse X: ${mouseX}, Mouse Y: ${mouseY}`);
    });
    window.addEventListener('mousedown', (event) => {
        if(isWinning){
            return;
        }
        if(!firstClick){
            playMenuBGM();
            firstClick=true;
        }
        if (event.button === 0) {
            if (!isAttacking) {
                isAttacking = true;
                attackPhase = 'START';
                playerHasDealtDamage = false;
            } 
            else if (attackPhase === 'RECOVER') {
                attackPhase = 'START2';
                playerHasDealtDamage = false;
            }
        }
    });
    
}

function tick() {
    if (isGameOver) {
        return; 
    }
    
    if(isWinning){
        reflectObjRotateAngle+=0.3;
        if(!winAnimation.check1){
            enemyX=0;enemyZ=0;
            playerX=0;playerZ=5;
            player.body_Angle.y = 0;
            if (typeof enemy !== 'undefined' && enemy) {
                enemy.body_Angle.y = 180;
            }
            currentCamX=2;currentCamY=3.5;currentCamZ=7;
            winAnimation.lookat.x=enemyX;
            winAnimation.lookat.y=enemyY;
            winAnimation.lookat.z=enemyZ;
            reflectCubeX=enemyX;
            reflectCubeY=enemyY;
            reflectCubeZ=enemyZ;
            winAnimation.check1=true;
        }
        else if(!winAnimation.check2){
            enemyPoseTransite('IDLE', 2);
            poseTransite('IDLE', 2);
            if(checkEnemyPoseReached('IDLE') && checkPoseReached('IDLE')){
                winAnimation.check2=true;
            }
        }
        else if (!winAnimation.check3) {
            winAnimation.lookat.x = reflectCubeX;
            winAnimation.lookat.y = reflectCubeY;
            winAnimation.lookat.z = reflectCubeZ;
            
            enemyPoseTransite('FALL', 0.5);
            if (typeof enemy !== 'undefined' && enemy && enemy.body_Angle) {
                var rad = enemy.body_Angle.x * Math.PI / 180.0;
                enemyY = 3.0 + 1.6 * Math.abs(Math.cos(rad));
            }
            
            if (checkEnemyPoseReached('FALL')) {
                enemyY = 3.0;
                winAnimation.check3 = true;
            }
        }
        else if(!winAnimation.check4){
            if(currentCamX<5){
                currentCamX+=0.01;
            }
            if(currentCamY<5){
                currentCamY+=0.01;
            }
            if(currentCamZ>3){
                currentCamZ-=0.01;
            }
            if(winAnimation.lookat.y>3.5){
                winAnimation.lookat.y-=0.01;
            }
            if(winAnimation.lookat.z<2.5){
                winAnimation.lookat.z+=0.01;
            }
            if(currentCamX>=5 && currentCamY>=5 && currentCamZ<=3 && winAnimation.lookat.y<=3.5 && winAnimation.lookat.z>=2.5){
                winAnimation.check4=true;
            }
        }
        else if(!winAnimation.check5){
            poseTransite('END', 0.5);
            if(checkPoseReached('END')){
                winAnimation.check5=true;
            }
        }
        else if(!winAnimation.check6){
            if(reflectCubeX>-0.05){
                reflectCubeX-=0.01;
            }
            if(reflectCubeY>4){
                reflectCubeY-=0.01;
            }
            if(reflectCubeZ<4.5){
                reflectCubeZ+=0.01;
            }
            if(reflectCube_scale>0.05){
                reflectCube_scale-=0.001;
            }
            winAnimation.lookat.x = reflectCubeX;
            winAnimation.lookat.y = reflectCubeY;
            winAnimation.lookat.z = reflectCubeZ;
            if(reflectCubeX<=-0.05 && reflectCubeY<=4 && reflectCubeZ>=4.5){
                reflectCubeX=-0.05
                reflectCubeY=4;
                reflectCubeZ=4.5;
                winAnimation.lookat.x = reflectCubeX;
                winAnimation.lookat.y = reflectCubeY;
                winAnimation.lookat.z = reflectCubeZ;
                winAnimation.check6=true;
            }
            
        }
        else if(!winAnimation.check7){
            if(currentCamX>0){
                currentCamX-=0.01;
            }
            if(currentCamY>4){
                currentCamY-=0.01;
            }
            if(currentCamZ>3){
                currentCamZ-=0.01;
            }
            if(currentCamX<=0 && currentCamY<=4.5 && currentCamZ<=3 ){
                winAnimation.check7=true;
            }
        }
        else if(winAnimation.counter<1000){
            winAnimation.counter++;
        }
        else{
            document.getElementById('win-screen').classList.remove('hidden');
            console.log("勝利演出結束UI 已展現。");
            stopAllBGM();
            isWinning=false;
            isGameOver=true;
            return;
        }

        draw();
        requestAnimationFrame(tick);
        return;
    }

    if (typeof enemy !== 'undefined' && enemy.isHit) {
        enemy.hitTimer--;
        if (enemy.hitTimer <= 0) enemy.isHit = false;
    }
    if (player.isHit) {
        player.hitTimer--;
        if (player.hitTimer <= 0) player.isHit = false;
    }

		if (Math.abs(mouseX) > DEADZONE) {
			let signX = Math.sign(mouseX);
			let excessX = mouseX - (signX * DEADZONE); 
			
			angleX -= excessX * ROTATE_DAMPING;
		}
		if (Math.abs(mouseY) > DEADZONE) {
			let signY = Math.sign(mouseY);
			let excessY = mouseY - (signY * DEADZONE);
			
			angleY += excessY * ROTATE_DAMPING;
		}
		if (angleY > 0.0) angleY = 0.0;
		if (angleY < -85.0) angleY = -85.0;
        if(player.rotateX){
            player.body_Angle.y=angleX;
        }
        keyAction();
        //console.log(`Player X: ${playerX}, Player Y: ${playerY}, Player Z: ${playerZ}`);
        enemyAction(playerX,playerZ);

    checkAllCollisions();

    draw();
    requestAnimationFrame(tick);
}

function draw(){
    //Off-Screen Rendering
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, offScreenWidth, offScreenHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    let platformModelMatrix = new Matrix4();
    platformModelMatrix.setIdentity();
    platformModelMatrix.scale(0.25, 0.25, 0.25);

    // 取得光源視角下的 MVP
    let platformMvpFromLight = drawOffScreen(platform_model, platformModelMatrix);

    //player
    playerDraw_offscreen(player);
    
    //enemy
    enemyDraw_offscreen();

    updateDynamicEnvMap(gl, platform_model, platformModelMatrix, platformMvpFromLight, player, skybox_draw);

    //On-Screen Rendering
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.2, 0.2, 0.2, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // 透視投影
    let projMatrix = new Matrix4();
    projMatrix.setPerspective(60, canvas.width / canvas.height, 0.1, 500);
	let baseViewMatrix = new Matrix4();
    if(isWinning){
        baseViewMatrix.lookAt(currentCamX, currentCamY, currentCamZ, winAnimation.lookat.x, winAnimation.lookat.y, winAnimation.lookat.z, 0, 1, 0);
    }
    else{
        // 相機跟隨角色與旋轉
        let camTransform = new Matrix4();
        camTransform.setIdentity();
        camTransform.translate(playerX, playerY, playerZ); 
        camTransform.rotate(angleX, 0, 1, 0);               
        camTransform.rotate(angleY, 1, 0, 0);               
        
        let localCamPos = new Vector4([0, 0, cameraDistance, 1]);
        let worldCamPos = camTransform.multiplyVector4(localCamPos);

        currentCamX = worldCamPos.elements[0];
        currentCamY = worldCamPos.elements[1];
        currentCamZ = worldCamPos.elements[2];
        baseViewMatrix.lookAt(currentCamX, currentCamY, currentCamZ, playerX, playerY, playerZ, 0, 1, 0);
    }
    
    let viewMatrixForSkybox = new Matrix4(baseViewMatrix);
    viewMatrixForSkybox.elements[12] = 0; 
    viewMatrixForSkybox.elements[13] = 0; 
    viewMatrixForSkybox.elements[14] = 0; 

    let vpForSkybox = new Matrix4(projMatrix).multiply(viewMatrixForSkybox);
    let vpFromCameraInverse = vpForSkybox.invert(); 
    skybox_draw(vpFromCameraInverse);

    let vpForModel = new Matrix4(projMatrix).multiply(baseViewMatrix);
    
    // 呼叫修正後的繪製函式，把算好的矩陣與相機位置傳進去
    drawObjectsOnScreen(platform_model, vpForModel, platformModelMatrix, platformMvpFromLight, currentCamX, currentCamY, currentCamZ, false);
    //player
    playerDraw_onsreen(player,vpForModel, currentCamX, currentCamY, currentCamZ);
    //enemy
    enemyDraw_onscreen(vpForModel, currentCamX, currentCamY, currentCamZ);
    if(isWinning){
        drawOnlyReflectiveCube(gl, vpForModel);
    }
}

function drawOffScreen(modelGroups, mdlMatrix){
    gl.useProgram(shadowProgram);
    if(!modelGroups) return new Matrix4();

    var mvpFromLight = new Matrix4();
    mvpFromLight.setOrtho(-20, 20, -20, 20, 1, 100);
    mvpFromLight.lookAt(lightX, lightY, lightZ, 0, 0, 0, 0, 1, 0);
    mvpFromLight.multiply(mdlMatrix);

    gl.uniformMatrix4fv(shadowProgram.u_MvpMatrix, false, mvpFromLight.elements);

    for(let i = 0; i < modelGroups.length; i++){
        let mesh = modelGroups[i];
        initAttributeVariable(gl, shadowProgram.a_Position, mesh.vertexBuffer);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.numVertices);
    }

    return mvpFromLight;
}

function drawObjectsOnScreen(modelGroups, vpMatrix, mdlMatrix, mvpFromLight, camX, camY, camZ, useTex){
    if(!modelGroups) return;
    gl.useProgram(program);

    let mvpFromCamera = new Matrix4(vpMatrix).multiply(mdlMatrix);
    let normalMatrix = new Matrix4();
    normalMatrix.setInverseOf(mdlMatrix);
    normalMatrix.transpose();

    gl.uniform3f(program.u_LightPosition, lightX, lightY, lightZ);
    gl.uniform3f(program.u_ViewPosition, camX, camY, camZ);
    gl.uniform3f(program.u_RimLightPosition, RimLightX, RimLightY, RimLightZ);
    gl.uniform3f(program.u_RimLightColor, 1.0, 0.0, 0.0);
    
    gl.activeTexture(gl.TEXTURE0);   
    gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
    gl.uniform1i(program.u_ShadowMap, 0);
    
    for(let i = 0; i < modelGroups.length; i++){
        let mesh = modelGroups[i];
        let mat = mesh.material;

        if (useTex && mat && mat.texture) {
            gl.uniform1f(program.u_UseTex, 1.0);
            
            if (mesh.texCoordBuffer && program.a_TexCoord !== -1) {
                initAttributeVariable(gl, program.a_TexCoord, mesh.texCoordBuffer);
            }
            
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, mat.texture);
            //console.log(`Texture: ${mat.texture}`);
            gl.uniform1i(program.u_Sampler, 1);
        }
        else {
            gl.uniform1f(program.u_UseTex, 0.0);
        }

        if (useTex && mat && mat.normalTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, mat.normalTexture);
            gl.uniform1i(program.u_NormalMap, 2);
            gl.uniform1i(program.u_UseNormalMap, 1);
            
            if (mesh.tangentsBuffer && program.a_Tangent !== -1) {
                initAttributeVariable(gl, program.a_Tangent, mesh.tangentsBuffer);
            }
            if (mesh.bitagentsBuffer && program.a_Bitagent !== -1) {
                initAttributeVariable(gl, program.a_Bitagent, mesh.bitagentsBuffer);
            }
            if (mesh.crossTexCoordsBuffer && program.a_crossTexCoord !== -1) {
                initAttributeVariable(gl, program.a_crossTexCoord, mesh.crossTexCoordsBuffer);
            }
        } else {
            gl.uniform1i(program.u_UseNormalMap, 0);
        }

        if (mat && mat.ambient) {
            let ambientIntensity = (mat.ambient[0] + mat.ambient[1] + mat.ambient[2]) / 3.0;
            gl.uniform1f(program.u_Ka, ambientIntensity);
        } else {
            gl.uniform1f(program.u_Ka, 0.2); 
        }

        if (mat && mat.diffuse) {
            let diffuseIntensity = (mat.diffuse[0] + mat.diffuse[1] + mat.diffuse[2]) / 3.0;
            gl.uniform1f(program.u_Kd, diffuseIntensity > 0.0 ? diffuseIntensity : 0.8);
        } else {
            gl.uniform1f(program.u_Kd, 0.8); 
        }

        if (mat && mat.diffuse) {
            gl.uniform3f(program.u_Color, mat.diffuse[0], mat.diffuse[1], mat.diffuse[2]);
        } else {
            gl.uniform3f(program.u_Color, 0.8, 0.8, 0.8); 
        }

        // Ks (鏡面光) 與 shininess (高光指數)
        if (mat && mat.specular) {
            gl.uniform1f(program.u_Ks, (mat.specular[0] + mat.specular[1] + mat.specular[2]) / 3.0);
        } else {
            gl.uniform1f(program.u_Ks, 0.0);
        }
        gl.uniform1f(program.u_shininess, (mat && mat.shininess) ? mat.shininess : 10.0);

        // === 6. 傳入必備的變換矩陣 ===
        gl.uniformMatrix4fv(program.u_MvpMatrix, false, mvpFromCamera.elements);
        gl.uniformMatrix4fv(program.u_modelMatrix, false, mdlMatrix.elements);
        gl.uniformMatrix4fv(program.u_normalMatrix, false, normalMatrix.elements);
        gl.uniformMatrix4fv(program.u_MvpMatrixOfLight, false, mvpFromLight.elements);

        // === 7. 啟用頂點與法向量緩衝區 ===
        initAttributeVariable(gl, program.a_Position, mesh.vertexBuffer);
        
        if(mesh.normalBuffer && program.a_Normal !== -1) {
            initAttributeVariable(gl, program.a_Normal, mesh.normalBuffer);
        }
        
        // 繪製當前網格
        gl.drawArrays(gl.TRIANGLES, 0, mesh.numVertices);
    }
}

function initFrameBuffer(gl){
  //create and set up a texture object as the color buffer
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, offScreenWidth, offScreenHeight,
                  0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  

  //create and setup a render buffer as the depth buffer
  var depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 
                          offScreenWidth, offScreenHeight);

  //create and setup framebuffer: linke the color and depth buffer to it
  var frameBuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                            gl.TEXTURE_2D, texture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, 
                              gl.RENDERBUFFER, depthBuffer);
  frameBuffer.texture = texture;
  return frameBuffer;
}

function initTexture(gl, imgSource, textureUnit) {
    var tex = gl.createTexture();
    var image = new Image();
    
    image.onload = function() {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.activeTexture(textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, tex);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        
        console.log("Texture loaded: " + imgSource);
        draw();
    };
    
    image.src = imgSource;
    return tex;
}

function moveTowards(current, target, maxStep) {
    let diff = target - current;
    
    if (Math.abs(diff) <= maxStep) {
        return target;
    }
    
    return current + Math.sign(diff) * maxStep;
}

function updateAttackLogic() {
    let attack1Speed = 3;
    let attack2Speed = 1.5;
    let recoverSpeed = 1;
    let recover2Speed = 2;
    
    let maxFreezeFrames = 30; 

    if (attackPhase === 'START') {
        poseTransite('ATTACK1_START', attack1Speed);
        if (checkPoseReached('ATTACK1_START')) {
            attackPhase = 'END';
            freezeCounter = 0; 
        }
    } 
    else if (attackPhase === 'END') {
        poseTransite('ATTACK1_END', attack1Speed);
        
        if (checkPoseReached('ATTACK1_END')) {
            if (freezeCounter < maxFreezeFrames) {
                freezeCounter++;
            } else {
                attackPhase = 'RECOVER';
            }
        }
    } 
    else if (attackPhase === 'RECOVER') {
        poseTransite('IDLE', recoverSpeed);
        if (checkPoseReached('IDLE')) {
            isAttacking = false;
            attackPhase = 'NONE';
        }
    }

    else if (attackPhase === 'START2') {
        poseTransite('ATTACK2_START', attack2Speed);
        if (checkPoseReached('ATTACK2_START')) {
            attackPhase = 'END2';
            freezeCounter = 0;
        }
    }
    else if (attackPhase === 'END2') {
        poseTransite('ATTACK2_END', attack2Speed);
        
        if (checkPoseReached('ATTACK2_END')) {
            if (freezeCounter < maxFreezeFrames) {
                freezeCounter++;
            } else {
                attackPhase = 'RECOVER2';
            }
        }
    }
    else if (attackPhase === 'RECOVER2') {
        poseTransite('IDLE', recover2Speed);
        if (checkPoseReached('IDLE')) {
            isAttacking = false;
            attackPhase = 'NONE';
        }
    }
}

function checkPoseReached(targetPoseName) {
    let target = poses[targetPoseName];
    for (const part in target) {
        let playerAngleKey = `${part}_Angle`;
        if (player[playerAngleKey]) {
            let cur = player[playerAngleKey];
            let tgt = target[part];
            
            if (Math.abs(tgt.x - cur.x) > 0.1 || Math.abs(tgt.z - cur.z) > 0.1) {
                return false;
            }
            if (part !== 'body' && Math.abs(tgt.y - cur.y) > 0.1) {
                return false;
            }
        }
    }
    return true;
}

function poseTransite(targetPose, speed) {
    let target = poses[targetPose];
    if (!target) return;

    let maxStep = speed; 

    for (const part in target) {
        let playerAngleKey = `${part}_Angle`;

        if (player[playerAngleKey]) {
            let currentAngle = player[playerAngleKey]; 
            let targetAngle = target[part];            

            currentAngle.x = moveTowards(currentAngle.x, targetAngle.x, maxStep);
            if(part!='body'){
                currentAngle.y = moveTowards(currentAngle.y, targetAngle.y, maxStep);
            }
            currentAngle.z = moveTowards(currentAngle.z, targetAngle.z, maxStep);
        }
    }
}

function keyAction(){
    if (isAttacking) {
        updateAttackLogic();
        return; 
    }

    var targetPose = 'IDLE';
    var speed = 2.0; 

    if(keysPressed['z']){ player.rotateX = false; }
    if(!keysPressed['z']){ player.rotateX = true; }

    if(keysPressed['w']){
        targetPose = 'MOVE_F';
        let newPos = playerMove_front(playerX, playerY, playerZ, currentCamX, currentCamY, currentCamZ, player);
        if(Math.sqrt(newPos.x * newPos.x + newPos.z * newPos.z)<25){
            playerX = newPos.x; playerZ = newPos.z;
        }
    }
    if(keysPressed['s']){
        targetPose = 'MOVE_B';
        let newPos = playerMove_back(playerX, playerY, playerZ, currentCamX, currentCamY, currentCamZ, player);
        if(Math.sqrt(newPos.x * newPos.x + newPos.z * newPos.z)<25){
            playerX = newPos.x; playerZ = newPos.z;
        }
    }
    if(keysPressed['d']){
        targetPose = 'MOVE_F';
        let newPos = playerMove_right(playerX, playerY, playerZ, currentCamX, currentCamY, currentCamZ, player);
        if(Math.sqrt(newPos.x * newPos.x + newPos.z * newPos.z)<25){
            playerX = newPos.x; playerZ = newPos.z;
        }
    }
    if(keysPressed['a']){
        targetPose = 'MOVE_F';
        let newPos = playerMove_left(playerX, playerY, playerZ, currentCamX, currentCamY, currentCamZ, player);
        if(Math.sqrt(newPos.x * newPos.x + newPos.z * newPos.z)<25){
            playerX = newPos.x; playerZ = newPos.z;
        }
    }

    poseTransite(targetPose, speed);
}

function getPositionFromMatrix(matrix) {
    if (!matrix || !matrix.elements) return { x: 0, y: 0, z: 0 };
    var e = matrix.elements;
    return { x: e[12], y: e[13], z: e[14] };
}

function checkPlayerRightHandHitEnemy(player, enemyX, enemyY, enemyZ, hitRadius = 1.2) {
    var handPos = getPositionFromMatrix(player.rightHand_Matrix);
    var dx = handPos.x - enemyX, dy = handPos.y - enemyY, dz = handPos.z - enemyZ;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) <= hitRadius;
}

function checkEnemyHandsHitPlayer(enemy, playerX, playerY, playerZ, playerRadius = 1.0) {
    var leftHandPos = getPositionFromMatrix(enemy.leftHand_Matrix);
    var rightHandPos = getPositionFromMatrix(enemy.rightHand_Matrix);
    
    var distLeft = Math.sqrt(Math.pow(leftHandPos.x - playerX, 2) + Math.pow(leftHandPos.y - playerY, 2) + Math.pow(leftHandPos.z - playerZ, 2));
    var distRight = Math.sqrt(Math.pow(rightHandPos.x - playerX, 2) + Math.pow(rightHandPos.y - playerY, 2) + Math.pow(rightHandPos.z - playerZ, 2));
    
    return (distLeft <= playerRadius) || (distRight <= playerRadius);
}

function checkAllCollisions(targetPose) {
    if (typeof enemy === 'undefined') return;

    if ((isAttacking) && !playerHasDealtDamage) {
        let hit = checkPlayerRightHandHitEnemy(player, enemyX, enemyY, enemyZ, 1.2);
        if (hit && !enemy.isHit && enemyHp > 0) {
            enemy.isHit = true;
            enemy.hitTimer = 15; 
            playerHasDealtDamage = true;
            
            enemyHp -= 15;
            if (enemyHp < 0) enemyHp = 0;
            
            var percent = (enemyHp / enemyMaxHp) * 100;
            document.getElementById('enemy-hp-fill').style.width = percent + '%';
            console.log("敵人受擊！HP: " + enemyHp);
            
            if (enemyHp === 0) {
                console.log("敵人格式化完成，玩家勝利！");
                //isGameOver = true;
                isWinning = true;
            }
        }
    }

    if (typeof enemy_isAttacking !== 'undefined' && enemy_isAttacking && !enemyHasDealtDamage) {
        let hurt = checkEnemyHandsHitPlayer(enemy, playerX, playerY, playerZ, 1.0);
        if (hurt && !player.isHit && playerHp > 0) {
            player.isHit = true;
            player.hitTimer = 15; 
            enemyHasDealtDamage = true;
            
            playerHp -= 10;
            if (playerHp < 0) playerHp = 0;
            
            var percent = (playerHp / playerMaxHp) * 100;
            document.getElementById('player-hp-fill').style.width = percent + '%';
            console.log("玩家受傷！HP: " + playerHp);
            
            if (playerHp === 0) {
                console.log("系統核心崩潰，GAME OVER！");
                isGameOver = true; 
                document.getElementById('lose-screen').classList.remove('hidden');
                stopallBGM();
            }
        }
    }
}

function showControls() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('controls-panel').classList.remove('hidden');
}
function hideControls() {
    document.getElementById('controls-panel').classList.add('hidden');
    document.getElementById('main-menu').classList.remove('hidden');
}
function startGameIntro() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('intro-panel').classList.remove('hidden');
    
    document.getElementById('crawl-text').addEventListener('animationend', enterRealGame);
    // 點擊任意處可直接跳過
    document.getElementById('intro-panel').onclick = function() { enterRealGame(); };
}
function enterRealGame() {
    playBattleBGM();
    if (document.getElementById('intro-panel').classList.contains('hidden')) return;
    document.getElementById('intro-panel').classList.add('hidden');
    document.getElementById('ui-container').classList.remove('hidden');
    isGameOver = false;
    tick(); 
}

function resetGame() {
    console.log("執行軟重設，保留模型快取，初始化遊戲數值...");

    isGameOver = false;
    isWinning = false;
    isAttacking = false;
    attackPhase = 'NONE';
    freezeCounter = 0;

    playerHp = 100;
    enemyHp = 150;
    playerHasDealtDamage = false;
    enemyHasDealtDamage = false;

    player.isHit = false;
    player.hitTimer = 0;
    if (typeof enemy !== 'undefined' && enemy !== null) {
        enemy.isHit = false;
        enemy.hitTimer = 0;
    }

    angleX = 0.0;
    angleY = 0.0;
    mouseX = 0.0;
    mouseY = 0.0;
    keysPressed = {};

    winAnimation = {
        lookat: {x: 0, y: 0, z: 0},
        check1: false,
        check2: false,
        check3: false,
        check4: false,
        check5: false,
        check6: false,
        check7: false,
        counter: 0
    };

    reflectObjRotateAngle = 0;
    reflectCubeX = 0; 
    reflectCubeY = 0; 
    reflectCubeZ = 0;

    playerX = 0.0; playerY = 3.6; playerZ = 10.0;
    enemyX = 0;    enemyY = 4.6; enemyZ = 0;

    document.getElementById('player-hp-fill').style.width = '100%';
    document.getElementById('enemy-hp-fill').style.width = '100%';

    document.getElementById('lose-screen').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');

    stopAllBGM();
    playBattleBGM();

    enterRealGame();
    tick();
}

function backToMenu() {
    isGameOver = true; 

    playerHp = 100;
    enemyHp = 150;
    document.getElementById('player-hp-fill').style.width = '100%';
    document.getElementById('enemy-hp-fill').style.width = '100%';

    playerX = 0.0; playerY = 3.6; playerZ = 10.0;
    enemyX = 0;    enemyY = 4.6; enemyZ = 0;

    if (typeof enemy !== 'undefined' && enemy !== null) {
        enemy.body_Angle = { x: -20, y: 0, z: 0 };
        if (typeof enemy_isAttacking !== 'undefined') enemy_isAttacking = false;
        if (typeof enemy_action !== 'undefined') enemy_action = 'IDLE';
    }

    document.getElementById('ui-container').classList.add('hidden');
    document.getElementById('lose-screen').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    if (document.getElementById('intro-panel')) {
        document.getElementById('intro-panel').classList.add('hidden');
    }

    document.getElementById('main-menu').classList.remove('hidden');

    stopAllBGM();
    playMenuBGM();

}