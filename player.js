async function playerFetch(player){
    const mtlUrl = 'playerOBJ/character.mtl';
    const mtlResponse = await fetch(mtlUrl);
    if (!mtlResponse.ok) throw new Error('無法載入角色材質 character.mtl');
    const mtlText = await mtlResponse.text();
    
    const sharedMtlData = parseMTL(mtlText);
    const sharedMtlPackage = {
        data: sharedMtlData,
        baseHref: mtlUrl.substring(0, mtlUrl.lastIndexOf('/') + 1)
    };

    console.log(" 快取材質包打包完成，開始 7 關節網路最大化平行載入...");

    const bodyPromise          = loadModel('playerOBJ/body.obj', sharedMtlPackage);
    const leftArmPromise       = loadModel('playerOBJ/leftArm.obj', sharedMtlPackage);
    const rightArmPromise      = loadModel('playerOBJ/rightArm.obj', sharedMtlPackage);
    const leftFrontArmPromise  = loadModel('playerOBJ/leftFrontArm.obj', sharedMtlPackage);
    const rightFrontArmPromise = loadModel('playerOBJ/rightFrontArm.obj', sharedMtlPackage);
    const leftHandPromise      = loadModel('playerOBJ/leftHand.obj', sharedMtlPackage);
    const rightHandPromise     = loadModel('playerOBJ/rightHand.obj', sharedMtlPackage);

    [
        player.body,
        player.leftArm,
        player.rightArm,
        player.leftFrontArm,
        player.rightFrontArm,
        player.leftHand,
        player.rightHand
    ] = await Promise.all([
        bodyPromise,
        leftArmPromise,
        rightArmPromise,
        leftFrontArmPromise,
        rightFrontArmPromise,
        leftHandPromise,
        rightHandPromise
    ]);
    playerDone=true;
    if(playerDone && enemyDone){
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerText = "開始遊戲";
        }
    }
    console.log("全角色物件與 WebGL 單一紋理執行個體平行載入成功！");
}

function playerDraw_offscreen(player){
    let playerModelMatrix = new Matrix4();
    //body
    playerModelMatrix.setIdentity();
    playerModelMatrix.translate(playerX, playerY, playerZ);
    playerModelMatrix.rotate(player.body_Angle.y, 0, 1, 0);
    playerModelMatrix.rotate(player.body_Angle.x, 1, 0, 0);
    playerModelMatrix.rotate(player.body_Angle.z, 0, 0, 1);
    player.body_Matrix.set(playerModelMatrix);
    player.body_Matrix.scale(1.25, 1.25, 1.25);
    player.body_MvpFromLight = drawOffScreen(player.body, player.body_Matrix);
    //leftArm
    player.leftArm_Matrix.set(playerModelMatrix);
    player.leftArm_Matrix.translate(-0.15, 0.3, -0.05);
    player.leftArm_Matrix.rotate(player.leftArm_Angle.y,0,1,0);
    player.leftArm_Matrix.rotate(player.leftArm_Angle.x,1,0,0);
    player.leftArm_Matrix.rotate(player.leftArm_Angle.z,0,0,1);
    player.leftArm_Matrix.translate(0,0.05,0);
    player.leftFrontArm_Matrix.set(player.leftArm_Matrix);//for leftFrontArm
    player.leftArm_Matrix.scale(1.25, 1.25, 1.25);
    player.leftArm_MvpFromLight=drawOffScreen(player.leftArm,player.leftArm_Matrix);
    //leftFrontArm
    player.leftFrontArm_Matrix.translate(-0.015,0.15,-0.015);
    player.leftFrontArm_Matrix.rotate(player.leftFrontArm_Angle.y,0,1,0);
    player.leftFrontArm_Matrix.rotate(player.leftFrontArm_Angle.x,1,0,0);
    player.leftFrontArm_Matrix.rotate(player.leftFrontArm_Angle.z,0,0,1);
    player.leftFrontArm_Matrix.translate(0,0.05,0);
    player.leftHand_Matrix.set(player.leftFrontArm_Matrix);//for leftHand
    player.leftFrontArm_Matrix.scale(1.25,1.25,1.25);
    player.leftFrontArm_MvpFromLight=drawOffScreen(player.leftFrontArm,player.leftFrontArm_Matrix);
    //leftHand
    player.leftHand_Matrix.translate(0.018,0.18,0);
    player.leftHand_Matrix.rotate(player.leftHand_Angle.y,0,1,0);
    player.leftHand_Matrix.rotate(player.leftHand_Angle.x,1,0,0);
    player.leftHand_Matrix.rotate(player.leftHand_Angle.z,0,0,1);
    player.leftHand_Matrix.scale(1.25,1.25,1.25);
    player.leftHand_MvpFromLight=drawOffScreen(player.leftHand,player.leftHand_Matrix);
    //rightArm
    player.rightArm_Matrix.set(playerModelMatrix);
    player.rightArm_Matrix.translate(0.16,0.3,-0.05);
    player.rightArm_Matrix.rotate(player.rightArm_Angle.y,0,1,0);
    player.rightArm_Matrix.rotate(player.rightArm_Angle.x,1,0,0);
    player.rightArm_Matrix.rotate(player.rightArm_Angle.z,0,0,1);
    player.rightArm_Matrix.translate(0,0.05,0);
    player.rightFrontArm_Matrix.set(player.rightArm_Matrix);//for rightFrontArm
    player.rightArm_Matrix.scale(1.25,1.25,1.25);
    player.rightArm_MvpFromLight=drawOffScreen(player.rightArm,player.rightArm_Matrix);
    //rightFrontArm
    player.rightFrontArm_Matrix.translate(-0.03,0.15,-0.02);
    player.rightFrontArm_Matrix.rotate(player.rightFrontArm_Angle.y,0,1,0);
    player.rightFrontArm_Matrix.rotate(player.rightFrontArm_Angle.x,1,0,0);
    player.rightFrontArm_Matrix.rotate(player.rightFrontArm_Angle.z,0,0,1);
    player.rightFrontArm_Matrix.translate(0,0.05,0);
    player.rightHand_Matrix.set(player.rightFrontArm_Matrix);
    player.rightFrontArm_Matrix.scale(1.25,1.25,1.25);
    player.rightFrontArm_MvpFromLight=drawOffScreen(player.rightFrontArm,player.rightFrontArm_Matrix);
    //rightHand
    player.rightHand_Matrix.translate(0.02,0.1,-0.01);
    player.rightHand_Matrix.rotate(player.rightHand_Angle.y,0,1,0);
    player.rightHand_Matrix.rotate(player.rightHand_Angle.x,1,0,0);
    player.rightHand_Matrix.rotate(player.rightHand_Angle.z,0,0,1);
    player.rightHand_Matrix.translate(0.05,0.09,-0.03);
    player.rightHand_Matrix.scale(1.25,1.25,1.25);
    player.rightHand_MvpFromLight=drawOffScreen(player.rightHand,player.rightHand_Matrix);
}

function playerDraw_onsreen(player,vpForModel, currentCamX, currentCamY, currentCamZ){
    gl.useProgram(program);
    gl.uniform1i(program.u_IsHit, player.isHit ? 1 : 0);
    drawObjectsOnScreen(player.body, vpForModel, player.body_Matrix, player.body_MvpFromLight, currentCamX, currentCamY, currentCamZ, true);
    drawObjectsOnScreen(player.leftArm,vpForModel,player.leftArm_Matrix,player.leftArm_MvpFromLight, currentCamX, currentCamY, currentCamZ, true);
    drawObjectsOnScreen(player.leftFrontArm,vpForModel,player.leftFrontArm_Matrix,player.leftFrontArm_MvpFromLight, currentCamX, currentCamY, currentCamZ, true);
    drawObjectsOnScreen(player.leftHand,vpForModel,player.leftHand_Matrix,player.leftHand_MvpFromLight, currentCamX, currentCamY, currentCamZ, true);
    drawObjectsOnScreen(player.rightArm,vpForModel,player.rightArm_Matrix,player.rightArm_MvpFromLight, currentCamX, currentCamY, currentCamZ, true);
    drawObjectsOnScreen(player.rightFrontArm,vpForModel,player.rightFrontArm_Matrix,player.rightFrontArm_MvpFromLight, currentCamX, currentCamY, currentCamZ, true);
    drawObjectsOnScreen(player.rightHand,vpForModel,player.rightHand_Matrix,player.rightHand_MvpFromLight, currentCamX, currentCamY, currentCamZ, true);
    gl.useProgram(program);
    gl.uniform1i(program.u_IsHit, 0);
}

function playerMove_front(playerX,playerY,playerZ,currentCamX,currentCamY,currentCamZ,player){
    var directX=playerX-currentCamX;
    var directZ=playerZ-currentCamZ;
    var distance = Math.sqrt(directX * directX + directZ * directZ);

    directX/=distance;
    directZ/=distance;

    playerX+=directX*0.02;
    playerZ+=directZ*0.02;

    return {x:playerX,z:playerZ};
}

function playerMove_back(playerX,playerY,playerZ,currentCamX,currentCamY,currentCamZ,player){
    var directX=playerX-currentCamX;
    var directZ=playerZ-currentCamZ;
    var distance = Math.sqrt(directX * directX + directZ * directZ);

    directX/=distance;
    directZ/=distance;

    playerX-=directX*0.02;
    playerZ-=directZ*0.02;
    
    return {x:playerX,z:playerZ};
}

function playerMove_right(playerX, playerY, playerZ, currentCamX, currentCamY, currentCamZ, player){
    var directX=playerX-currentCamX;
    var directZ=playerZ-currentCamZ;
    var distance=Math.sqrt(directX*directX+directZ*directZ);
    
    directX/=distance;
    directZ/=distance;
    
    var rightX= -directZ;
    var rightZ= directX;
    
    var moveSpeed=0.02; 
    
    var newX=playerX+rightX*moveSpeed;
    var newZ=playerZ+rightZ*moveSpeed;
    
    return {
        x: newX,
        z: newZ
    };
}

function playerMove_left(playerX, playerY, playerZ, currentCamX, currentCamY, currentCamZ, player){
    var directX=playerX-currentCamX;
    var directZ=playerZ-currentCamZ;
    var distance=Math.sqrt(directX*directX+directZ*directZ);
    
    directX/=distance;
    directZ/=distance;
    
    var rightX= directZ;
    var rightZ= -directX;
    
    var moveSpeed=0.02; 
    
    var newX=playerX+rightX*moveSpeed;
    var newZ=playerZ+rightZ*moveSpeed;
    
    return {
        x: newX,
        z: newZ
    };
}