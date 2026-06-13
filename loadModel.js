function parseOBJ(text) {
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];

  const objVertexData = [objPositions, objTexcoords, objNormals];
  let webglVertexData = [[], [], []];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ['default'];
  let material = 'default';
  let object = 'default';

  const noop = () => {};

  function newGeometry() {
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const position = [];
      const texcoord = [];
      const normal = [];
      webglVertexData = [position, texcoord, normal];
      geometry = {
        object,
        groups,
        material,
        data: { position, texcoord, normal },
      };
      geometries.push(geometry);
    }
  }

  function addVertex(vert) {
    const ptn = vert.split('/');
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) return;
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
    });
  }

  const keywords = {
    v(parts) { objPositions.push(parts.map(parseFloat)); },
    vn(parts) { objNormals.push(parts.map(parseFloat)); },
    vt(parts) { objTexcoords.push(parts.map(parseFloat)); },
    f(parts) {
      setGeometry();
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
    s: noop,
    mtllib(parts, unparsedArgs) { materialLibs.push(unparsedArgs); },
    usemtl(parts, unparsedArgs) { material = unparsedArgs; newGeometry(); },
    g(parts) { groups = parts; newGeometry(); },
    o(parts, unparsedArgs) { object = unparsedArgs; newGeometry(); },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = keywordRE.exec(line);
    if (!m) continue;
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) continue;
    handler(parts, unparsedArgs);
  }

  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(
        Object.entries(geometry.data).filter(([, array]) => array.length > 0));
  }

  return { geometries, materialLibs };
}

function parseMTL(text) {
  const materials = {};
  let currentMaterial = null;

  const keywords = {
    newmtl(parts, unparsedArgs) {
      currentMaterial = {
        name: unparsedArgs,
        ambient: [0, 0, 0],
        diffuse: [0, 0, 0],
        specular: [0, 0, 0],
        shininess: 0,
        opacity: 1.0,
        mapDiffuse: null,
        refractionIndex: 1.0,
        transmissionFilter: [1.0, 1.0, 1.0],
        emissive: [0.0, 0.0, 0.0]
      };
      materials[unparsedArgs] = currentMaterial;
    },
    Ns(parts) { if (currentMaterial) currentMaterial.shininess = parseFloat(parts[0]); },
    Ka(parts) { if (currentMaterial) currentMaterial.ambient = parts.map(parseFloat); },
    Kd(parts) { if (currentMaterial) currentMaterial.diffuse = parts.map(parseFloat); },
    Ks(parts) { if (currentMaterial) currentMaterial.specular = parts.map(parseFloat); },
    d(parts) { if (currentMaterial) currentMaterial.opacity = parseFloat(parts[0]); },
    Tr(parts) { if (currentMaterial) currentMaterial.opacity = 1.0 - parseFloat(parts[0]); },
    map_Kd(parts, unparsedArgs) { if (currentMaterial) currentMaterial.mapDiffuse = unparsedArgs; },
    Ni(parts) { if (currentMaterial) currentMaterial.refractionIndex = parseFloat(parts[0]); },
    Tf(parts) { if (currentMaterial) currentMaterial.transmissionFilter = parts.map(parseFloat); },
    Ke(parts) { if (currentMaterial) currentMaterial.emissive = parts.map(parseFloat); },
    illum() {},
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');

  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = keywordRE.exec(line);
    if (!m) continue;
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) continue;
    handler(parts, unparsedArgs);
  }

  return materials;
}

function createWebGLTexture(gl, url, isNormalMap = false) {
  return new Promise((resolve) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const defaultPixel = isNormalMap ? new Uint8Array([128, 128, 255, 255]) : new Uint8Array([0, 0, 255, 255]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, defaultPixel);

    const image = new Image();
    image.src = url;
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      
      if ((image.width & (image.width - 1)) === 0 && (image.height & (image.height - 1)) === 0) {
        gl.generateMipmap(gl.TEXTURE_2D);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }
      resolve(texture);
    };
    image.onerror = () => {
      resolve(isNormalMap ? null : texture); 
    };
  });
}

function getNormalMapUrl(url) {
    let dotIndex = url.lastIndexOf('.');
    if (dotIndex === -1) return null;
    let base = url.substring(0, dotIndex);
    let ext = url.substring(dotIndex);
    if (base.endsWith('mat7_c')) {
        return null;
    }
    if (base.endsWith('_c')) {
        base = base.substring(0, base.length - 2);
    }
    return base + "_n" + ext;
}

async function loadModel(objUrl, mtlDataOrUrl) {
    try {
        let mtlData;
        let baseHref = '';
        
        if (typeof mtlDataOrUrl === 'string') {
            const [objResponse, mtlResponse] = await Promise.all([fetch(objUrl), fetch(mtlDataOrUrl)]);
            if (!objResponse.ok || !mtlResponse.ok) throw new Error('無法載入檔案');
            const objText = await objResponse.text();
            const mtlText = await mtlResponse.text();
            
            var objData = parseOBJ(objText);
            mtlData = parseMTL(mtlText);
            baseHref = mtlDataOrUrl.substring(0, mtlDataOrUrl.lastIndexOf('/') + 1);
        } else {
            const objResponse = await fetch(objUrl);
            if (!objResponse.ok) throw new Error('無法載入 OBJ 網格');
            const objText = await objResponse.text();
            
            var objData = parseOBJ(objText);
            mtlData = mtlDataOrUrl.data; 
            baseHref = mtlDataOrUrl.baseHref;
        }

        const texturePromises = {};
        const normalTexturePromises = {};

        for (const matName in mtlData) {
            const mat = mtlData[matName];
            if (mat.mapDiffuse) {
                let textureFileName = mat.mapDiffuse.replace(/\\/g, '/');
                const textureUrl = textureFileName.startsWith('http') ? textureFileName : baseHref + textureFileName;
                
                // 只有在快取材質庫中還沒載入過該圖，才啟動新的非同步下載 Promise
                if (!mat.texture && !texturePromises[textureUrl]) {
                    texturePromises[textureUrl] = createWebGLTexture(gl, textureUrl, false);
                }

                const normalUrl = getNormalMapUrl(textureUrl);
                if (normalUrl && !mat.normalTexture && !normalTexturePromises[normalUrl]) {
                    normalTexturePromises[normalUrl] = createWebGLTexture(gl, normalUrl, true);
                }
            }
        }
        
        const textureUrls = Object.keys(texturePromises);
        const textures = await Promise.all(Object.values(texturePromises));
        const normalUrls = Object.keys(normalTexturePromises);
        const normalTextures = await Promise.all(Object.values(normalTexturePromises));
        
        const textureMap = {}; textureUrls.forEach((url, i) => textureMap[url] = textures[i]);
        const normalTextureMap = {}; normalUrls.forEach((url, i) => normalTextureMap[url] = normalTextures[i]);

        const readyToDrawObjects = objData.geometries.map(geometry => {
            const matName = geometry.material;
            const originalMaterial = mtlData[matName];
            const materialInfo = originalMaterial ? { ...originalMaterial } : {
                name: 'default', ambient: [0.2, 0.2, 0.2], diffuse: [0.5, 0.5, 0.5], specular: [0.0, 0.0, 0.0], shininess: 0.0, opacity: 1.0, mapDiffuse: null
            };

            if (materialInfo.mapDiffuse) {
                let textureFileName = materialInfo.mapDiffuse.replace(/\\/g, '/');
                const textureUrl = textureFileName.startsWith('http') ? textureFileName : baseHref + textureFileName;
                
                materialInfo.texture = originalMaterial.texture || textureMap[textureUrl] || null;
                const normalUrl = getNormalMapUrl(textureUrl);
                materialInfo.normalTexture = originalMaterial.normalTexture || normalTextureMap[normalUrl] || null;
                
                if (originalMaterial) {
                    if (!originalMaterial.texture) originalMaterial.texture = materialInfo.texture;
                    if (!originalMaterial.normalTexture) originalMaterial.normalTexture = materialInfo.normalTexture;
                }
            } else {
                materialInfo.texture = null;
                materialInfo.normalTexture = null;
            }

            if (!geometry.data.normal || geometry.data.normal.length === 0) {
                const pos = geometry.data.position;
                const numVertices = pos.length / 3;
                const computedNormals = new Float32Array(pos.length);
                for (let v = 0; v < numVertices; v += 3) {
                    let i0 = v * 3, i1 = (v + 1) * 3, i2 = (v + 2) * 3;
                    let p0 = [pos[i0], pos[i0+1], pos[i0+2]], p1 = [pos[i1], pos[i1+1], pos[i1+2]], p2 = [pos[i2], pos[i2+1], pos[i2+2]];
                    let v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
                    let nx = v1[1] * v2[2] - v1[2] * v2[1], ny = v1[2] * v2[0] - v1[0] * v2[2], nz = v1[0] * v2[1] - v1[1] * v2[0];
                    let len = Math.sqrt(nx*nx + ny*ny + nz*nz);
                    if (len > 0) { nx /= len; ny /= len; nz /= len; }
                    computedNormals[i0] = nx; computedNormals[i0+1] = ny; computedNormals[i0+2] = nz;
                    computedNormals[i1] = nx; computedNormals[i1+1] = ny; computedNormals[i1+2] = nz;
                    computedNormals[i2] = nx; computedNormals[i2+1] = ny; computedNormals[i2+2] = nz;
                }
                geometry.data.normal = computedNormals;
            }

            const vertexBuffer = initArrayBufferForLaterUse(gl, new Float32Array(geometry.data.position), 3, gl.FLOAT);
            const normalBuffer = initArrayBufferForLaterUse(gl, new Float32Array(geometry.data.normal), 3, gl.FLOAT);
            let texCoordBuffer = geometry.data.texcoord && geometry.data.texcoord.length > 0 ? initArrayBufferForLaterUse(gl, new Float32Array(geometry.data.texcoord), 2, gl.FLOAT) : null;

            return { numVertices: geometry.data.position.length / 3, vertexBuffer, normalBuffer, texCoordBuffer, material: materialInfo };
        });

        return readyToDrawObjects;
    } catch (error) {
        console.error("載入 3D 模型時發生錯誤:", error);
        return null;
    }
}

function getEnemyNormalMapUrl(url, matObject = null) {
    if (matObject && matObject.mapBump) {
        return matObject.mapBump.replace(/\\/g, '/');
    }

    let dotIndex = url.lastIndexOf('.');
    if (dotIndex === -1) return null;
    let base = url.substring(0, dotIndex);
    let ext = url.substring(dotIndex);

    if (base.endsWith('_BaseColor')) {
        return base.substring(0, base.length - 10) + "_Normal_OpenGL" + ext;
    }

    return base + "_n" + ext;
}

async function enemyLoadModel(objUrl, mtlDataPackage) {
    try {
        const objResponse = await fetch(objUrl);
        if (!objResponse.ok) throw new Error(`無法載入敵人 OBJ: ${objUrl}`);
        const objText = await objResponse.text();
        
        const objData = parseOBJ(objText);
        const mtlData = mtlDataPackage.data; 
        const baseHref = mtlDataPackage.baseHref;

        const texturePromises = {};
        const normalTexturePromises = {};

        for (const matName in mtlData) {
            const mat = mtlData[matName];
            if (mat.mapDiffuse) {
                let textureFileName = mat.mapDiffuse.replace(/\\/g, '/');
                const textureUrl = textureFileName.startsWith('http') ? textureFileName : baseHref + textureFileName;
                
                if (!mat.texture && !texturePromises[textureUrl]) {
                    texturePromises[textureUrl] = createWebGLTexture(gl, textureUrl, false);
                }

                const normalUrl = getEnemyNormalMapUrl(textureUrl, mat);
                if (normalUrl && !mat.normalTexture && !normalTexturePromises[normalUrl]) {
                    normalTexturePromises[normalUrl] = createWebGLTexture(gl, normalUrl, true);
                }
            }
        }
        
        const textureUrls = Object.keys(texturePromises);
        const textures = await Promise.all(Object.values(texturePromises));
        const normalUrls = Object.keys(normalTexturePromises);
        const normalTextures = await Promise.all(Object.values(normalTexturePromises));
        
        const textureMap = {}; textureUrls.forEach((url, i) => textureMap[url] = textures[i]);
        const normalTextureMap = {}; normalUrls.forEach((url, i) => normalTextureMap[url] = normalTextures[i]);

        const readyToDrawObjects = objData.geometries.map(geometry => {
            const matName = geometry.material;
            const originalMaterial = mtlData[matName];
            const materialInfo = originalMaterial ? { ...originalMaterial } : { };

            if (materialInfo.mapDiffuse) {
                let textureFileName = materialInfo.mapDiffuse.replace(/\\/g, '/');
                const textureUrl = textureFileName.startsWith('http') ? textureFileName : baseHref + textureFileName;
                
                materialInfo.texture = originalMaterial.texture || textureMap[textureUrl] || null;
                
                const normalUrl = getEnemyNormalMapUrl(textureUrl, originalMaterial);
                const fullNormalUrl = normalUrl ? (normalUrl.startsWith('http') ? normalUrl : baseHref + normalUrl) : null;
                materialInfo.normalTexture = originalMaterial.normalTexture || normalTextureMap[fullNormalUrl] || null;
                
                if (originalMaterial) {
                    if (!originalMaterial.texture) originalMaterial.texture = materialInfo.texture;
                    if (!originalMaterial.normalTexture) originalMaterial.normalTexture = materialInfo.normalTexture;
                }
            }

            if (!geometry.data.normal || geometry.data.normal.length === 0) {
                const pos = geometry.data.position;
                const numVertices = pos.length / 3;
                const computedNormals = new Float32Array(pos.length);
                for (let v = 0; v < numVertices; v += 3) {
                    let i0 = v * 3, i1 = (v + 1) * 3, i2 = (v + 2) * 3;
                    let p0 = [pos[i0], pos[i0+1], pos[i0+2]], p1 = [pos[i1], pos[i1+1], pos[i1+2]], p2 = [pos[i2], pos[i2+1], pos[i2+2]];
                    let v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], v2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
                    let nx = v1[1] * v2[2] - v1[2] * v2[1], ny = v1[2] * v2[0] - v1[0] * v2[2], nz = v1[0] * v2[1] - v1[1] * v2[0];
                    let len = Math.sqrt(nx*nx + ny*ny + nz*nz);
                    if (len > 0) { nx /= len; ny /= len; nz /= len; }
                    computedNormals[i0] = nx; computedNormals[i0+1] = ny; computedNormals[i0+2] = nz;
                    computedNormals[i1] = nx; computedNormals[i1+1] = ny; computedNormals[i1+2] = nz;
                    computedNormals[i2] = nx; computedNormals[i2+1] = ny; computedNormals[i2+2] = nz;
                }
                geometry.data.normal = computedNormals;
            }

            const vertexBuffer = initArrayBufferForLaterUse(gl, new Float32Array(geometry.data.position), 3, gl.FLOAT);
            const normalBuffer = initArrayBufferForLaterUse(gl, new Float32Array(geometry.data.normal), 3, gl.FLOAT);
            let texCoordBuffer = geometry.data.texcoord && geometry.data.texcoord.length > 0 ? initArrayBufferForLaterUse(gl, new Float32Array(geometry.data.texcoord), 2, gl.FLOAT) : null;

            return { numVertices: geometry.data.position.length / 3, vertexBuffer, normalBuffer, texCoordBuffer, material: materialInfo };
        });

        return readyToDrawObjects;
    } catch (error) {
        console.error("enemyLoadModel 發生錯誤:", error);
        return null;
    }
}