var enemyX=0,enemyY=4.6,enemyZ=0;
let enemy={
    body:null,
    leftArm:null,
    leftHand:null,
    rightArm:null,
    rightHand:null,
    leftLeg:null,
    leftFoot:null,
    rightLeg:null,
    rightFoot:null,
    body_Angle: {x:-20,y:0,z:0},
    body_Matrix: new Matrix4(),
    body_MvpFromLight: new Matrix4(),
    leftArm_Angle: {x:200,y:0,z:10},
    leftArm_Matrix: new Matrix4(),
    leftArm_MvpFromLight: new Matrix4(),
    leftHand_Angle:{x:40,y:0,z:0},
    leftHand_Matrix: new Matrix4(),
    leftHand_MvpFromLight: new Matrix4(),
    rightArm_Angle:{x:230,y:0,z:-20},
    rightArm_Matrix: new Matrix4(),
    rightArm_MvpFromLight: new Matrix4(),
    rightHand_Angle:{x:60,y:0,z:0},
    rightHand_Matrix: new Matrix4(),
    rightHand_MvpFromLight: new Matrix4(),
    leftLeg_Angle: {x:270,y:20,z:0},
    leftLeg_Matrix: new Matrix4(),
    leftLeg_MvpFromLight: new Matrix4(),
    leftFoot_Angle:{x:-50,y:0,z:0},
    leftFoot_Matrix: new Matrix4(),
    leftFoot_MvpFromLight: new Matrix4(),
    rightLeg_Angle:{x:200,y:-20,z:0},
    rightLeg_Matrix: new Matrix4(),
    rightLeg_MvpFromLight: new Matrix4(),
    rightFoot_Angle:{x:-20,y:0,z:0},
    rightFoot_Matrix: new Matrix4(),
    rightFoot_MvpFromLight: new Matrix4(),
    isHit: false,      // 目前是否處於受擊狀態
    hitTimer: 0,       // 閃爍倒數計時器
};

var enemy_isAttacking = false;
var enemy_action='IDLE';
var enemy_actionPhase = 'ATTACK1'; // 可為：'NONE', 'ATTACK1', 'ATTACK2', 'WALK1', 'WALK2', 'RECOVER'
var enemy_freezeCounter = 0; 

let enemyPoses={
    IDLE:{
        body:{x:-20,y:0,z:0},
        leftArm:{x:220,y:0,z:10},
        leftHand:{x:40,y:0,z:0},
        rightArm:{x:200,y:0,z:-20},
        rightHand:{x:60,y:0,z:0},
        leftLeg:{x:220,y:20,z:0},
        leftFoot:{x:-20,y:0,z:0},
        rightLeg:{x:220,y:-20,z:0},
        rightFoot:{x:-20,y:0,z:0}
    },
    WALK1:{
        body:{x:-20,y:0,z:0},
        leftArm:{x:200,y:0,z:10},
        leftHand:{x:40,y:0,z:0},
        rightArm:{x:230,y:0,z:-20},
        rightHand:{x:60,y:0,z:0},
        leftLeg:{x:270,y:20,z:0},
        leftFoot:{x:-70,y:0,z:0},
        rightLeg:{x:180,y:-20,z:0},
        rightFoot:{x:-20,y:0,z:0}
    },
    WALK2:{
        body:{x:-20,y:0,z:0},
        leftArm:{x:230,y:0,z:10},
        leftHand:{x:40,y:0,z:0},
        rightArm:{x:200,y:0,z:-20},
        rightHand:{x:60,y:0,z:0},
        leftLeg:{x:180,y:20,z:0},
        leftFoot:{x:-20,y:0,z:0},
        rightLeg:{x:270,y:-20,z:0},
        rightFoot:{x:-70,y:0,z:0}
    },
    ATTACK1:{
        body:{x:-45,y:0,z:0},
        leftArm:{x:300,y:0,z:10},
        leftHand:{x:50,y:0,z:0},
        rightArm:{x:240,y:0,z:10},
        rightHand:{x:30,y:0,z:0},
        leftLeg:{x:240,y:20,z:0},
        leftFoot:{x:-20,y:0,z:0},
        rightLeg:{x:240,y:-20,z:0},
        rightFoot:{x:-20,y:0,z:0}
    },
    ATTACK2:{
        body:{x:-45,y:0,z:0},
        leftArm:{x:240,y:0,z:-10},
        leftHand:{x:30,y:0,z:0},
        rightArm:{x:300,y:0,z:-20},
        rightHand:{x:50,y:0,z:0},
        leftLeg:{x:240,y:20,z:0},
        leftFoot:{x:-20,y:0,z:0},
        rightLeg:{x:240,y:-20,z:0},
        rightFoot:{x:-20,y:0,z:0}
    },
    FALL:{
        body:{x:90,y:0,z:0},
        leftArm:{x:220,y:0,z:10},
        leftHand:{x:40,y:0,z:0},
        rightArm:{x:200,y:0,z:-20},
        rightHand:{x:60,y:0,z:0},
        leftLeg:{x:220,y:20,z:0},
        leftFoot:{x:-20,y:0,z:0},
        rightLeg:{x:220,y:-20,z:0},
        rightFoot:{x:-20,y:0,z:0}
    },
};

async function enemyFetch() {
    console.log(" 啟動獨立敵人的多網格平行載入流程...");
    
    const mtlUrl = 'enemyOBJ/skeleton.mtl'; 
    const mtlResponse = await fetch(mtlUrl);
    if (!mtlResponse.ok) throw new Error('無法載入敵人材質檔 enemy.mtl');
    const mtlText = await mtlResponse.text();
    
    const sharedEnemyMtlData = parseMTL(mtlText);
    const enemyMtlPackage = {
        data: sharedEnemyMtlData,
        baseHref: mtlUrl.substring(0, mtlUrl.lastIndexOf('/') + 1)
    };

    console.log("📦 敵人快取材質包打包完畢，開始 9 核心網格平行加載...");

    const bodyPromise      = enemyLoadModel('enemyOBJ/body.obj', enemyMtlPackage);
    const leftArmPromise   = enemyLoadModel('enemyOBJ/leftArm.obj', enemyMtlPackage);
    const leftHandPromise  = enemyLoadModel('enemyOBJ/leftHand.obj', enemyMtlPackage);
    const rightArmPromise  = enemyLoadModel('enemyOBJ/rightArm.obj', enemyMtlPackage);
    const rightHandPromise = enemyLoadModel('enemyOBJ/rightHand.obj', enemyMtlPackage);
    const leftLegPromise   = enemyLoadModel('enemyOBJ/leftLeg.obj', enemyMtlPackage);
    const leftFootPromise  = enemyLoadModel('enemyOBJ/leftFoot.obj', enemyMtlPackage);
    const rightLegPromise  = enemyLoadModel('enemyOBJ/rightLeg.obj', enemyMtlPackage);
    const rightFootPromise = enemyLoadModel('enemyOBJ/rightFoot.obj', enemyMtlPackage);

    [
        enemy.body,
        enemy.leftArm,
        enemy.leftHand,
        enemy.rightArm,
        enemy.rightHand,
        enemy.leftLeg,
        enemy.leftFoot,
        enemy.rightLeg,
        enemy.rightFoot
    ] = await Promise.all([
        bodyPromise,
        leftArmPromise,
        leftHandPromise,
        rightArmPromise,
        rightHandPromise,
        leftLegPromise,
        leftFootPromise,
        rightLegPromise,
        rightFootPromise
    ]);
    enemyDone=true;
    if(playerDone && enemyDone){
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerText = "開始遊戲";
        }
    }
    console.log("獨立敵人 9 大部件與 Blender 快取貼圖全部平行載入成功！");
}

function enemyDraw_offscreen(){
    let enemyModelMatrix=new Matrix4();
    //body
    enemyModelMatrix.setIdentity();
    enemyModelMatrix.translate(enemyX,enemyY,enemyZ);
    enemyModelMatrix.rotate(enemy.body_Angle.y,0,1,0);
    enemyModelMatrix.rotate(enemy.body_Angle.x,1,0,0);
    enemyModelMatrix.rotate(enemy.body_Angle.z,0,0,1);
    enemy.body_Matrix.set(enemyModelMatrix);
    enemy.body_Matrix.scale(1.5,1.5,1.5);
    enemy.body_MvpFromLight=drawOffScreen(enemy.body,enemy.body_Matrix);
    //leftArm
    enemy.leftArm_Matrix.set(enemyModelMatrix);
    enemy.leftArm_Matrix.translate(-0.35,0.15,0);
    enemy.leftArm_Matrix.rotate(enemy.leftArm_Angle.y,0,1,0);
    enemy.leftArm_Matrix.rotate(enemy.leftArm_Angle.x,1,0,0);
    enemy.leftArm_Matrix.rotate(enemy.leftArm_Angle.z,0,0,1);
    enemy.leftArm_Matrix.translate(0,0.3,0);
    enemy.leftHand_Matrix.set(enemy.leftArm_Matrix);//for leftHand
    enemy.leftArm_Matrix.scale(1.5,1.5,1.5)
    enemy.leftArm_MvpFromLight=drawOffScreen(enemy.leftArm,enemy.leftArm_Matrix);
    //leftHand
    enemy.leftHand_Matrix.translate(0,0.25,0);
    enemy.leftHand_Matrix.rotate(enemy.leftHand_Angle.y,0,1,0);
    enemy.leftHand_Matrix.rotate(enemy.leftHand_Angle.x,1,0,0);
    enemy.leftHand_Matrix.rotate(enemy.leftHand_Angle.z,0,0,1);
    enemy.leftHand_Matrix.translate(0,0.3,0);
    enemy.leftHand_Matrix.scale(1.5,1.5,1.5);
    enemy.leftHand_MvpFromLight=drawOffScreen(enemy.leftHand,enemy.leftHand_Matrix);
    //rightArm
    enemy.rightArm_Matrix.set(enemyModelMatrix);
    enemy.rightArm_Matrix.translate(0.35,0.15,0.1);
    enemy.rightArm_Matrix.rotate(enemy.rightArm_Angle.y,0,1,0);
    enemy.rightArm_Matrix.rotate(enemy.rightArm_Angle.x,1,0,0);
    enemy.rightArm_Matrix.rotate(enemy.rightArm_Angle.z,0,0,1);
    enemy.rightArm_Matrix.translate(0,0.3,0);
    enemy.rightHand_Matrix.set(enemy.rightArm_Matrix);//for rightHand
    enemy.rightArm_Matrix.scale(1.5,1.5,1.5)
    enemy.rightArm_MvpFromLight=drawOffScreen(enemy.rightArm,enemy.rightArm_Matrix);
    //rightHand
    enemy.rightHand_Matrix.translate(0,0.26,0);
    enemy.rightHand_Matrix.rotate(enemy.rightHand_Angle.y,0,1,0);
    enemy.rightHand_Matrix.rotate(enemy.rightHand_Angle.x,1,0,0);
    enemy.rightHand_Matrix.rotate(enemy.rightHand_Angle.z,0,0,1);
    enemy.rightHand_Matrix.translate(0,0.35,0);
    enemy.rightHand_Matrix.scale(1.5,1.5,1.5);
    enemy.rightHand_MvpFromLight=drawOffScreen(enemy.rightHand,enemy.rightHand_Matrix);
    //leftLeg
    enemy.leftLeg_Matrix.set(enemyModelMatrix);
    enemy.leftLeg_Matrix.translate(-0.18,-0.9,0);
    enemy.leftLeg_Matrix.rotate(enemy.leftLeg_Angle.y,0,1,0);
    enemy.leftLeg_Matrix.rotate(enemy.leftLeg_Angle.x,1,0,0);
    enemy.leftLeg_Matrix.rotate(enemy.leftLeg_Angle.z,0,0,1);
    enemy.leftLeg_Matrix.translate(0,0.2,0);
    enemy.leftFoot_Matrix.set(enemy.leftLeg_Matrix);//for leftFoot
    enemy.leftLeg_Matrix.scale(1.5,1.5,1.5);
    enemy.leftLeg_MvpFromLight=drawOffScreen(enemy.leftLeg,enemy.leftLeg_Matrix);
    //leftFoot
    enemy.leftFoot_Matrix.translate(0,0.4,0);
    enemy.leftFoot_Matrix.rotate(enemy.leftFoot_Angle.y,0,1,0);
    enemy.leftFoot_Matrix.rotate(enemy.leftFoot_Angle.x,1,0,0);
    enemy.leftFoot_Matrix.rotate(enemy.leftFoot_Angle.z,0,0,1);
    enemy.leftFoot_Matrix.translate(0,0.25,0);
    enemy.leftFoot_Matrix.scale(1.5,1.5,1.5);
    enemy.leftFoot_MvpFromLight=drawOffScreen(enemy.leftFoot,enemy.leftFoot_Matrix);
    //rightLeg
    enemy.rightLeg_Matrix.set(enemyModelMatrix);
    enemy.rightLeg_Matrix.translate(0.18,-0.9,0);
    enemy.rightLeg_Matrix.rotate(enemy.rightLeg_Angle.y,0,1,0);
    enemy.rightLeg_Matrix.rotate(enemy.rightLeg_Angle.x,1,0,0);
    enemy.rightLeg_Matrix.rotate(enemy.rightLeg_Angle.z,0,0,1);
    enemy.rightLeg_Matrix.translate(0,0.2,0);
    enemy.rightFoot_Matrix.set(enemy.rightLeg_Matrix);//for leftFoot
    enemy.rightLeg_Matrix.scale(1.5,1.5,1.5);
    enemy.rightLeg_MvpFromLight=drawOffScreen(enemy.rightLeg,enemy.rightLeg_Matrix);
    //rightFoot
    enemy.rightFoot_Matrix.translate(0,0.4,0.05);
    enemy.rightFoot_Matrix.rotate(enemy.rightFoot_Angle.y,0,1,0);
    enemy.rightFoot_Matrix.rotate(enemy.rightFoot_Angle.x,1,0,0);
    enemy.rightFoot_Matrix.rotate(enemy.rightFoot_Angle.z,0,0,1);
    enemy.rightFoot_Matrix.translate(0,0.45,0);
    enemy.rightFoot_Matrix.scale(1.5,1.5,1.5);
    enemy.rightFoot_MvpFromLight=drawOffScreen(enemy.rightFoot,enemy.rightFoot_Matrix);
}

function enemyDraw_onscreen(vpForModel, currentCamX, currentCamY, currentCamZ){
    gl.useProgram(program);
    gl.uniform1i(program.u_IsHit, enemy.isHit ? 1 : 0);
    drawObjectsOnScreen(enemy.body,vpForModel,enemy.body_Matrix,enemy.body_MvpFromLight, currentCamX, currentCamY, currentCamZ,true);
    drawObjectsOnScreen(enemy.leftArm,vpForModel,enemy.leftArm_Matrix,enemy.leftArm_MvpFromLight, currentCamX, currentCamY, currentCamZ,true);
    drawObjectsOnScreen(enemy.leftHand,vpForModel,enemy.leftHand_Matrix,enemy.leftHand_MvpFromLight, currentCamX, currentCamY, currentCamZ,true);
    drawObjectsOnScreen(enemy.rightArm,vpForModel,enemy.rightArm_Matrix,enemy.rightArm_MvpFromLight, currentCamX, currentCamY, currentCamZ,true);
    drawObjectsOnScreen(enemy.rightHand,vpForModel,enemy.rightHand_Matrix,enemy.rightHand_MvpFromLight, currentCamX, currentCamY, currentCamZ,true);
    drawObjectsOnScreen(enemy.leftLeg,vpForModel,enemy.leftLeg_Matrix,enemy.leftLeg_MvpFromLight, currentCamX, currentCamY, currentCamZ,true);
    drawObjectsOnScreen(enemy.leftFoot,vpForModel,enemy.leftFoot_Matrix,enemy.leftFoot_MvpFromLight, currentCamX, currentCamY, currentCamZ,true);
    drawObjectsOnScreen(enemy.rightLeg,vpForModel,enemy.rightLeg_Matrix,enemy.rightLeg_MvpFromLight, currentCamX, currentCamY, currentCamZ,true);
    drawObjectsOnScreen(enemy.rightFoot,vpForModel,enemy.rightFoot_Matrix,enemy.rightFoot_MvpFromLight, currentCamX, currentCamY, currentCamZ,true);
    gl.useProgram(program);
    gl.uniform1i(program.u_IsHit, 0);
}

function enemyMoveTowards(current, target, maxStep) {
    let diff = target - current;
    
    // 如果距離小於一幀能走的步伐，代表這一幀就能直接走到目的地
    if (Math.abs(diff) <= maxStep) {
        return target;
    }
    
    // 否則，朝目標方向前進一個固定的步長 (maxStep)
    return current + Math.sign(diff) * maxStep;
}


function updateEnemyAttackLogic() {
    let attack1Speed = 1.5;   // 第一段：揮擊/蓄力速度
    let recoverSpeed = 0.5;   // 第一段收招速度
    
    // 設定敵人砍完人後，你想讓它定格、卡肉或停頓的幀數
    let maxFreezeFrames = 40; 

    if (enemy_actionPhase === 'ATTACK1') {
        enemyPoseTransite('ATTACK1', attack1Speed);
        if (checkEnemyPoseReached('ATTACK1')) {
            if (enemy_freezeCounter < maxFreezeFrames) {
                enemy_freezeCounter++; // 強行留在這個分支，不換動作
            } 
            else{
                enemy_actionPhase = 'ATTACK2';
                enemy_freezeCounter = 0; // 進入 END 前，先把計數器歸零
                enemyHasDealtDamage = false;
            }
        }
        //console.log('ATTACK1');
    } 
    else if (enemy_actionPhase === 'ATTACK2') {
        enemyPoseTransite('ATTACK2', attack1Speed);
        
        if (checkEnemyPoseReached('ATTACK2')) {
            // 到位了不立刻切換，先在原地定格/數格子
            if (enemy_freezeCounter < maxFreezeFrames) {
                enemy_freezeCounter++; // 強行留在這個分支，不換動作
            } 
            else if(enemy_isAttacking){
                enemy_actionPhase = 'ATTACK1';
                enemy_freezeCounter=0;
                enemyHasDealtDamage = false;
            }
            else {
                enemy_actionPhase = 'RECOVER'; // 數完了，才進入第一段收招
                enemy_freezeCounter=0;
            }
        }
        //console.log('ATTACK2');
    } 
    else if (enemy_actionPhase === 'RECOVER') {
        enemyPoseTransite('IDLE', recoverSpeed);
        if (checkEnemyPoseReached('IDLE')) {
            enemy_action = 'IDLE';
            enemy_actionPhase = 'NONE';
        }
        //console.log('RECOVER');
    }
    else{
        enemy_actionPhase = 'ATTACK1';
        enemyHasDealtDamage = false;
    }
}

function updateEnemyWalkLogic(){
    let maxWalkFreezeFrames = 60; 
    let walkPoseSpeed = 0.5; 
    let moveSpeed = 0.005;
    if (enemy_actionPhase !== 'WALK1' && enemy_actionPhase !== 'WALK2') {
            enemy_actionPhase = 'WALK1';
    }

    if (enemy_actionPhase === 'WALK1') {
        enemyPoseTransite('WALK1', walkPoseSpeed); 
        if (checkEnemyPoseReached('WALK1')) {
            if (enemy_freezeCounter < maxWalkFreezeFrames) {
                enemy_freezeCounter++; // 強行留在這個分支，不換動作
            } 
            else{
                enemy_actionPhase = 'WALK2'; 
                enemy_freezeCounter = 0;
            }
        }
        else{
            var tmpX=enemyX,tmpZ=enemyZ;
            enemyX -= Math.sin(enemy.body_Angle.y * Math.PI / 180) * moveSpeed;
            enemyZ -= Math.cos(enemy.body_Angle.y * Math.PI / 180) * moveSpeed;
            if(Math.sqrt(enemyX*enemyX+enemyZ*enemyZ)>25){
                enemyX=tmpX;
                enemyZ=tmpZ;
            }
        }
    } 
    else if (enemy_actionPhase === 'WALK2') {
        enemyPoseTransite('WALK2', walkPoseSpeed);   
        if (checkEnemyPoseReached('WALK2')) {
            if (enemy_freezeCounter < maxWalkFreezeFrames) {
                enemy_freezeCounter++; // 強行留在這個分支，不換動作
            } 
            else{
                enemy_actionPhase = 'WALK1'; 
                enemy_freezeCounter = 0; 
            }
        }
        else{
            var tmpX=enemyX,tmpZ=enemyZ;
            enemyX -= Math.sin(enemy.body_Angle.y * Math.PI / 180) * moveSpeed;
            enemyZ -= Math.cos(enemy.body_Angle.y * Math.PI / 180) * moveSpeed;
            if(Math.sqrt(enemyX*enemyX+enemyZ*enemyZ)>25){
                enemyX=tmpX;
                enemyZ=tmpZ;
            }
        }
    }
}

function checkEnemyPoseReached(targetPoseName) {
    let target = enemyPoses[targetPoseName];
    if (!target) return true;

    for (const part in target) {
        let enemyAngleKey = `${part}_Angle`;
        
        if (enemy[enemyAngleKey]) {
            let cur = enemy[enemyAngleKey];
            let tgt = target[part];
            
            if (Math.abs(tgt.x - cur.x) > 0.1 || Math.abs(tgt.z - cur.z) > 0.1) {
                //console.log('Check:false1');
                return false;
            }
            if (part !== 'body' && Math.abs(tgt.y - cur.y) > 0.1) {
                //console.log('Check:false2');
                return false;
            }
        }
    }
    //console.log('Check:true');
    return true;
}


function enemyPoseTransite(targetPose, speed) {
    let target = enemyPoses[targetPose];
    if (!target) return;

    let maxStep = speed;

    for (const part in target) {
        let enemyAngleKey = `${part}_Angle`;

        if (enemy[enemyAngleKey]) {
            let currentAngle = enemy[enemyAngleKey]; 
            let targetAngle = target[part];            

            currentAngle.x = enemyMoveTowards(currentAngle.x, targetAngle.x, maxStep);
            
            if (part !== 'body') {
                currentAngle.y = enemyMoveTowards(currentAngle.y, targetAngle.y, maxStep);
            }
            
            currentAngle.z = enemyMoveTowards(currentAngle.z, targetAngle.z, maxStep);
        }
    }
}

function enemyAction(playerX,playerZ) {
    if(enemy_isAttacking){
        enemy_action='ATTACK';
        updateEnemyAttackLogic();
    }
    let dx = playerX - enemyX;
    let dz = playerZ - enemyZ;
    let distance = Math.sqrt(dx * dx + dz * dz);

    let attackRadius = 0.7;    
    let turnSpeed = 0.2; 
    if(distance>attackRadius){
        enemy_action='WALK';
        enemy_isAttacking=false;
        let targetAngle = (Math.atan2(dx, dz) * 180 / Math.PI) + 180;
        targetAngle = (targetAngle % 360 + 360) % 360;
        let currentAngle = (enemy.body_Angle.y % 360 + 360) % 360;
        let angleDiff = targetAngle - currentAngle;
        
        while (angleDiff < -180) angleDiff += 360;
        while (angleDiff > 180) angleDiff -= 360;

        enemy.body_Angle.y = enemyMoveTowards(currentAngle, currentAngle + angleDiff, turnSpeed);
        let angleError = Math.abs(angleDiff); 

        if (angleError > 5.0) {
            enemyPoseTransite('IDLE', turnSpeed);
            return; 
        }
        else{
            updateEnemyWalkLogic();
        }
    }
    else{
        enemy_isAttacking = true;
        enemy_action = 'ATTACK';
        updateEnemyAttackLogic();
    }
}

