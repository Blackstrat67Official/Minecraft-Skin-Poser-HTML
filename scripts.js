let scene, camera, renderer, controls, gridHelper, transformControl;
const playersData = {}; 
let playerCountGlobal = 0;

let historyStack = [];
let historyIndex = -1;
let isRestoring = false;

const boneMap = {
    'glob': { pos: ['x', 'y', 'z'] },
    'head': { rot: ['x', 'y', 'z'] },
    'spine': { rot: ['x', 'y', 'z'] },
    'larm': { rot: ['x', 'y', 'z'] },
    'lelbow': { rot: ['x'] },
    'rarm': { rot: ['x', 'y', 'z'] },
    'relbow': { rot: ['x'] },
    'lleg': { rot: ['x', 'y', 'z'] },
    'lknee': { rot: ['x'] },
    'rleg': { rot: ['x', 'y', 'z'] },
    'rknee': { rot: ['x'] },
    'body': { rot: ['y'] },
    'item1': { rot: ['x','y','z'], pos: ['x','y','z'] },
    'item2': { rot: ['x','y','z'], pos: ['x','y','z'] }
};

const SCALE = 1; 
const DIM = { head: [8,8,8], body: [8,12,4], arm: [4,12,4], leg: [4,12,4] };

const defaultCanvas = document.createElement('canvas');
defaultCanvas.width = 64; defaultCanvas.height = 64;
const ctx = defaultCanvas.getContext('2d');
ctx.fillStyle = '#404040'; ctx.fillRect(0, 0, 64, 64);
ctx.fillStyle = '#111111'; ctx.fillRect(8, 8, 8, 8); 
ctx.fillStyle = '#fff'; ctx.fillRect(10, 12, 1, 1); ctx.fillRect(13, 12, 1, 1);
ctx.fillStyle = '#555555'; ctx.fillRect(20, 20, 8, 12);
ctx.fillStyle = '#333333'; ctx.fillRect(44, 20, 4, 12); ctx.fillRect(4, 20, 4, 12);
const defaultDataURL = defaultCanvas.toDataURL();

function init() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#000000');
    scene.fog = new THREE.FogExp2('#000000', 0.005);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 5, 60);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0); controls.minDistance = 5; controls.maxDistance = 200;

    transformControl = new THREE.TransformControls(camera, renderer.domElement);
    transformControl.addEventListener('dragging-changed', function(event) {
        controls.enabled = !event.value;
        if (!event.value && !isRestoring) saveState();
    });
    transformControl.addEventListener('change', updateUIFromGizmo);
    scene.add(transformControl);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6); dirLight.position.set(20, 50, 30); scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3); fillLight.position.set(-20, 10, -30); scene.add(fillLight);

    gridHelper = new THREE.GridHelper(200, 100, 0x333333, 0x111111);
    gridHelper.position.y = -DIM.leg[1] - DIM.body[1]/2 + 8 - DIM.leg[1]; 
    scene.add( gridHelper );

    window.addEventListener('resize', onWindowResize, false);
    setupGlobalEvents(); setupToolbarEvents();

    document.getElementById('loading-overlay').style.opacity = '0';
    setTimeout(() => { document.getElementById('loading-overlay').style.display = 'none'; }, 300);

    createPlayer(); saveState(); animate();
}

// --- UNDO / REDO ---
function saveState() {
    if (isRestoring) return;
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(generateSceneJSON());
    historyIndex++;
}
function undo() { if (historyIndex > 0) { historyIndex--; applySceneJSON(historyStack[historyIndex]); } }
function redo() { if (historyIndex < historyStack.length - 1) { historyIndex++; applySceneJSON(historyStack[historyIndex]); } }

function generateSceneJSON() {
    const state = { players: [], scene: {} };
    state.scene.bgColor = document.getElementById('bg-color').value;
    state.scene.grid = document.getElementById('toggle-grid').checked;
    
    document.querySelectorAll('.player-panel').forEach(panel => {
        const idMatch = panel.id.match(/panel-(.+)/); if(!idMatch) return;
        const id = idMatch[1]; const controls = {};
        panel.querySelectorAll('input[type=range], input[type=checkbox], select, input.value-input').forEach(input => {
            if(input.type === 'file') return;
            controls[input.id.replace(`-${id}`, '')] = input.type === 'checkbox' ? input.checked : input.value;
        });
        state.players.push({ id, controls, skinUrl: playersData[id].skinUrl || defaultDataURL, item1Url: playersData[id].item1Url, item2Url: playersData[id].item2Url });
    });
    return state;
}

function applySceneJSON(state) {
    isRestoring = true; transformControl.detach();
    const currentPanels = document.querySelectorAll('.player-panel');
    if (currentPanels.length !== state.players.length) {
        Object.keys(playersData).forEach(id => removePlayer(id));
        playerCountGlobal = 0;
        state.players.forEach(p => applyPlayerState(createPlayer(), p));
    } else {
        Array.from(currentPanels).forEach((panel, i) => applyPlayerState(panel.id.match(/panel-(.+)/)[1], state.players[i]));
    }
    
    document.getElementById('bg-color').value = state.scene.bgColor; document.getElementById('bg-color').dispatchEvent(new Event('input'));
    document.getElementById('toggle-grid').checked = state.scene.grid; document.getElementById('toggle-grid').dispatchEvent(new Event('change'));
    isRestoring = false;
}

function applyPlayerState(id, pState) {
    if (pState.skinUrl && playersData[id].skinUrl !== pState.skinUrl) loadSkinTexture(pState.skinUrl, id);
    if (pState.item1Url && playersData[id].item1Url !== pState.item1Url) loadItemTexture(pState.item1Url, 1, id);
    if (pState.item2Url && playersData[id].item2Url !== pState.item2Url) loadItemTexture(pState.item2Url, 2, id);

    Object.keys(pState.controls).forEach(baseId => {
        const el = document.getElementById(`${baseId}-${id}`);
        if(!el) return;
        if(el.type === 'checkbox') {
            if (el.checked !== pState.controls[baseId]) { el.checked = pState.controls[baseId]; el.dispatchEvent(new Event('change')); }
        } else if (el.value != pState.controls[baseId]) {
            el.value = pState.controls[baseId]; el.dispatchEvent(new Event('input'));
        }
    });
}

// --- GIZMO 3D ---
function setupToolbarEvents() {
    const setMode = (m, bid) => {
        m ? transformControl.setMode(m) : transformControl.detach();
        ['tool-select','tool-translate','tool-rotate'].forEach(id => document.getElementById(id).classList.remove('active'));
        document.getElementById(bid).classList.add('active');
    };

    document.getElementById('tool-select').addEventListener('click', () => setMode(null, 'tool-select'));
    document.getElementById('tool-translate').addEventListener('click', () => setMode('translate', 'tool-translate'));
    document.getElementById('tool-rotate').addEventListener('click', () => setMode('rotate', 'tool-rotate'));
    document.getElementById('tool-undo').addEventListener('click', undo);
    document.getElementById('tool-redo').addEventListener('click', redo);

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.ctrlKey && e.key === 'z') undo();
        if (e.ctrlKey && e.key === 'y') redo();
        if (e.key === 'w') document.getElementById('tool-translate').click();
        if (e.key === 'e') document.getElementById('tool-rotate').click();
        if (e.key === 'Escape') document.getElementById('tool-select').click();
    });

    const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();
    window.addEventListener('mousedown', (event) => {
        if(event.target.tagName !== 'CANVAS' || document.body.classList.contains('preview-mode')) return;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left)/rect.width)*2 - 1; mouse.y = -((event.clientY - rect.top)/rect.height)*2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const ints = raycaster.intersectObjects(scene.children, true).filter(i => !i.object.parent || i.object.parent.type !== "TransformControlsPlane");

        let target = null;
        for(let i=0; i<ints.length; i++) {
            let curr = ints[i].object;
            while(curr && curr !== scene) {
                if (curr.userData?.baseId) { target = curr; break; }
                curr = curr.parent;
            }
            if(target) break;
        }

        if (target && transformControl.mode !== null) {
            transformControl.attach(target);
            if (transformControl.mode === 'translate' && !boneMap[target.userData.baseId]?.pos) document.getElementById('tool-rotate').click();
        } else if (!transformControl.dragging && document.getElementById('tool-select').classList.contains('active')) {
            transformControl.detach();
        }
    });
}

function updateUIFromGizmo() {
    if(isRestoring || !transformControl.object?.userData) return;
    const obj = transformControl.object; const bid = obj.userData.baseId; const pid = obj.userData.pid; const map = boneMap[bid];
    isRestoring = true;

    const sV = (rb, nb, val) => {
        const r = document.getElementById(rb), n = document.getElementById(nb);
        if(r) r.value = val; if(n) n.value = val;
    };

    if (transformControl.mode === 'rotate' && map?.rot) {
        const rot = obj.rotation, deg = THREE.MathUtils.radToDeg;
        if(map.rot.includes('x')) sV(`${bid}-x-${pid}`, `val-${bid}-x-${pid}`, Math.round(deg(rot.x)));
        if(map.rot.includes('y')) sV(`${bid}-y-${pid}`, `val-${bid}-y-${pid}`, Math.round(deg(rot.y)));
        if(map.rot.includes('z')) sV(`${bid}-z-${pid}`, `val-${bid}-z-${pid}`, Math.round(deg(rot.z)));
    }

    if (transformControl.mode === 'translate' && map?.pos) {
        const pos = obj.position, pfx = bid === 'glob' ? 'glob' : `${bid}-pos`;
        if(map.pos.includes('x')) sV(`${pfx}-x-${pid}`, `val-${pfx}-x-${pid}`, pos.x.toFixed(1));
        if(map.pos.includes('y')) sV(`${pfx}-y-${pid}`, `val-${pfx}-y-${pid}`, pos.y.toFixed(1));
        if(map.pos.includes('z')) sV(`${pfx}-z-${pid}`, `val-${pfx}-z-${pid}`, pos.z.toFixed(1));
    }
    isRestoring = false;
}

// --- UI BASE ---
function toggleAccordion(id) { document.getElementById(`content-${id}`).classList.toggle('hidden'); }

function removePlayer(id, e) {
    if(e) e.stopPropagation();
    if(playersData[id]) {
        scene.remove(playersData[id].root);
        if (transformControl.object?.userData.pid === id) transformControl.detach();
        delete playersData[id];
    }
    document.getElementById(`panel-${id}`)?.remove();
    saveState();
}

function createPlayer() {
    playerCountGlobal++; const id = 'p' + Date.now();
    const html = document.getElementById('player-template').innerHTML.replace(/__ID__/g, id).replace(/__NUM__/g, playerCountGlobal);
    const div = document.createElement('div'); div.innerHTML = html;
    document.getElementById('players-container').appendChild(div.firstElementChild);
    if(playerCountGlobal === 1) document.getElementById(`content-${id}`).classList.remove('hidden');

    buildCharacter(id); setupPlayerUIEvents(id); loadSkinTexture(defaultDataURL, id);
    return id;
}

function setupGlobalEvents() {
    document.getElementById('btn-add-player').addEventListener('click', () => { createPlayer(); saveState(); });

    document.getElementById('bg-color').addEventListener('input', (e) => {
        scene.background = new THREE.Color(e.target.value);
        scene.fog = new THREE.FogExp2(e.target.value, 0.005);
        if(!isRestoring) saveState();
    });

    document.getElementById('bg-upload').addEventListener('change', e => {
        const f = e.target.files[0]; if(!f) return;
        const r = new FileReader();
        r.onload = ev => {
            const img = new Image(); img.onload = () => {
                const tex = new THREE.Texture(img); tex.needsUpdate = true;
                scene.background = tex; scene.fog = null;
                if(!isRestoring) saveState();
            }; img.src = ev.target.result;
        }; r.readAsDataURL(f);
    });

    document.getElementById('toggle-grid').addEventListener('change', e => {
        gridHelper.visible = e.target.checked; if(!isRestoring) saveState();
    });

    document.getElementById('btn-preview-mode').addEventListener('click', () => {
        document.body.classList.add('preview-mode'); transformControl.detach();
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    });
    document.getElementById('btn-exit-preview').addEventListener('click', () => {
        document.body.classList.remove('preview-mode');
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    });

    const dl = () => {
        transformControl.detach(); renderer.render(scene, camera); 
        const a = document.createElement('a'); a.href = renderer.domElement.toDataURL('image/png'); a.download = 'skin_render.png'; a.click();
    };
    document.getElementById('btn-download').addEventListener('click', dl);
    document.getElementById('btn-download-preview').addEventListener('click', dl);

    document.getElementById('btn-export-json').addEventListener('click', () => {
        const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(generateSceneJSON())); 
        a.download = "scene_preset.json"; a.click();
    });

    document.getElementById('preset-upload').addEventListener('change', e => {
        const f = e.target.files[0]; if(!f) return;
        const r = new FileReader(); r.onload = ev => { try { applySceneJSON(JSON.parse(ev.target.result)); saveState(); } catch(e){} };
        r.readAsText(f); e.target.value = '';
    });
}

function setupPlayerUIEvents(id) {
    document.getElementById(`skin-upload-${id}`).addEventListener('change', e => {
        const f = e.target.files[0]; if(!f) return;
        const r = new FileReader(); r.onload = ev => { loadSkinTexture(ev.target.result, id); saveState(); }; r.readAsDataURL(f);
    });
    
    [1, 2].forEach(idx => {
        document.getElementById(`item${idx}-visible-${id}`).addEventListener('change', e => {
            const g = idx === 1 ? playersData[id].items.group1 : playersData[id].items.group2;
            if(g) g.visible = e.target.checked; saveState();
        });
        document.getElementById(`item${idx}-upload-${id}`).addEventListener('change', e => {
            const f = e.target.files[0]; if(!f) return;
            const r = new FileReader(); r.onload = ev => { loadItemTexture(ev.target.result, idx, id); saveState(); }; r.readAsDataURL(f);
        });
        document.getElementById(`item${idx}-hand-${id}`).addEventListener('change', e => {
            const g = idx === 1 ? playersData[id].items.group1 : playersData[id].items.group2;
            playersData[id].groups.itemAnchorL.remove(g); playersData[id].groups.itemAnchorR.remove(g);
            (e.target.value === 'left' ? playersData[id].groups.itemAnchorL : playersData[id].groups.itemAnchorR).add(g);
            saveState();
        });
    });

    const bindUI = (baseId, target, axis) => {
        const rng = document.getElementById(`${baseId}-${id}`), num = document.getElementById(`val-${baseId}-${id}`);
        if(!rng || !num) return;
        const update = val => axis.startsWith('p') ? target.position[axis[1]] = parseFloat(val) : target.rotation[axis] = val * (Math.PI/180);
        const evFn = (e) => { if(isRestoring) return; (e.target === rng ? num : rng).value = e.target.value; update(e.target.value); };
        rng.addEventListener('input', evFn); rng.addEventListener('change', () => { if(!isRestoring) saveState()});
        num.addEventListener('input', evFn); num.addEventListener('change', () => { if(!isRestoring) saveState()});
    };

    const pd = playersData[id];
    bindUI('glob-x', pd.root, 'px'); bindUI('glob-y', pd.root, 'py'); bindUI('glob-z', pd.root, 'pz');
    ['head','spine'].forEach(b => { bindUI(`${b}-x`, pd.groups[b==='spine'?'upperBody':b], 'x'); bindUI(`${b}-y`, pd.groups[b==='spine'?'upperBody':b], 'y'); bindUI(`${b}-z`, pd.groups[b==='spine'?'upperBody':b], 'z'); });
    ['larm','rarm','lleg','rleg'].forEach(b => { const bg=pd.groups['upper'+b.charAt(0).toUpperCase()+b.slice(1)]; bindUI(`${b}-x`, bg, 'x'); bindUI(`${b}-y`, bg, 'y'); bindUI(`${b}-z`, bg, 'z'); });
    ['lelbow','relbow','lknee','rknee'].forEach(b => bindUI(`${b}-x`, pd.groups['lower'+b.charAt(0).toUpperCase()+b.slice(1)], 'x'));
    bindUI('body-y', pd.groups.lowerBody, 'y');

    [1, 2].forEach(idx => {
        const g = idx === 1 ? pd.items.group1 : pd.items.group2;
        ['x','y','z'].forEach(a => { bindUI(`item${idx}-rot-${a}`, g, a); bindUI(`item${idx}-pos-${a}`, g, 'p'+a); });
        ['scale', 'thick'].forEach(prop => {
            const r = document.getElementById(`item${idx}-${prop}-${id}`), n = document.getElementById(`val-item${idx}-${prop}-${id}`);
            const evFn = e => {
                if(isRestoring) return; (e.target === r ? n : r).value = e.target.value;
                const s = parseFloat(document.getElementById(`item${idx}-scale-${id}`).value), t = parseFloat(document.getElementById(`item${idx}-thick-${id}`).value);
                const m = idx === 1 ? pd.items.mesh1 : pd.items.mesh2; if(m) m.scale.set(s,s,t);
            };
            r.addEventListener('input', evFn); r.addEventListener('change', () => { if(!isRestoring) saveState()});
            n.addEventListener('input', evFn); n.addEventListener('change', () => { if(!isRestoring) saveState()});
        });
    });

    document.getElementById(`btn-export-player-${id}`).addEventListener('click', () => {
        const pst = { controls: {}, skinUrl: pd.skinUrl, item1Url: pd.item1Url, item2Url: pd.item2Url };
        document.getElementById(`panel-${id}`).querySelectorAll('input[type=range], input[type=checkbox], input.value-input, select').forEach(i => {
            if(i.type!=='file') pst.controls[i.id.replace(`-${id}`,'')] = i.type==='checkbox' ? i.checked : i.value;
        });
        const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pst)); 
        a.download = `player_preset_${id}.json`; a.click();
    });

    document.getElementById(`btn-import-player-${id}`).addEventListener('change', e => {
        const f = e.target.files[0]; if(!f) return;
        const r = new FileReader(); r.onload = ev => { applyPlayerState(id, JSON.parse(ev.target.result)); saveState(); };
        r.readAsText(f); e.target.value = '';
    });

    document.getElementById(`toggle-joints-${id}`).addEventListener('change', e => {
        const sh = e.target.checked; document.getElementById(`panel-${id}`).querySelectorAll('.joint-controls').forEach(el => el.classList.toggle('active', sh));
        if (!sh) { ['spine-x','spine-y','spine-z','lelbow-x','relbow-x','lknee-x','rknee-x'].forEach(bid => {
            const s = document.getElementById(`${bid}-${id}`); if(s){ s.value = 0; s.dispatchEvent(new Event('input')); }
        }); saveState(); }
    });

    document.getElementById(`btn-reset-${id}`).addEventListener('click', () => {
        document.getElementById(`panel-${id}`).querySelectorAll('input[type=range]').forEach(s => {
            if(s.id.includes('scale')) s.value = 0.8; else if(s.id.includes('thick')) s.value = 1; else if(s.id.includes('glob')) return; else s.value = 0;
            s.dispatchEvent(new Event('input')); 
        }); saveState();
    });
}

// --- CORE 3D GEOMETRIE ---
function createMaterialArrayForPart(ctx, partDef, segment = 'full') {
    if (!ctx) return new Array(6).fill(new THREE.MeshLambertMaterial({color: 0xcccccc}));
    const defs = {
        'head': [ {x:16,y:8,w:8,h:8}, {x:0,y:8,w:8,h:8}, {x:8,y:0,w:8,h:8}, {x:16,y:0,w:8,h:8}, {x:8,y:8,w:8,h:8}, {x:24,y:8,w:8,h:8} ],
        'headOuter': [ {x:48,y:8,w:8,h:8}, {x:32,y:8,w:8,h:8}, {x:40,y:0,w:8,h:8}, {x:48,y:0,w:8,h:8}, {x:40,y:8,w:8,h:8}, {x:56,y:8,w:8,h:8} ],
        'body': [ {x:28,y:20,w:4,h:12}, {x:16,y:20,w:4,h:12}, {x:20,y:16,w:8,h:4}, {x:28,y:16,w:8,h:4}, {x:20,y:20,w:8,h:12}, {x:32,y:20,w:8,h:12} ],
        'bodyOuter': [ {x:28,y:36,w:4,h:12}, {x:16,y:36,w:4,h:12}, {x:20,y:32,w:8,h:4}, {x:28,y:32,w:8,h:4}, {x:20,y:36,w:8,h:12}, {x:32,y:36,w:8,h:12} ],
        'rightArm': [ {x:48,y:20,w:4,h:12}, {x:40,y:20,w:4,h:12}, {x:44,y:16,w:4,h:4}, {x:48,y:16,w:4,h:4}, {x:44,y:20,w:4,h:12}, {x:52,y:20,w:4,h:12} ],
        'rightArmOuter': [ {x:48,y:36,w:4,h:12}, {x:40,y:36,w:4,h:12}, {x:44,y:32,w:4,h:4}, {x:48,y:32,w:4,h:4}, {x:44,y:36,w:4,h:12}, {x:52,y:36,w:4,h:12} ],
        'leftArm': [ {x:40,y:52,w:4,h:12}, {x:32,y:52,w:4,h:12}, {x:36,y:48,w:4,h:4}, {x:40,y:48,w:4,h:4}, {x:36,y:52,w:4,h:12}, {x:44,y:52,w:4,h:12} ],
        'leftArmOuter': [ {x:56,y:52,w:4,h:12}, {x:48,y:52,w:4,h:12}, {x:52,y:48,w:4,h:4}, {x:56,y:48,w:4,h:4}, {x:52,y:52,w:4,h:12}, {x:60,y:52,w:4,h:12} ],
        'rightLeg': [ {x:8,y:20,w:4,h:12}, {x:0,y:20,w:4,h:12}, {x:4,y:16,w:4,h:4}, {x:8,y:16,w:4,h:4}, {x:4,y:20,w:4,h:12}, {x:12,y:20,w:4,h:12} ],
        'rightLegOuter': [ {x:8,y:36,w:4,h:12}, {x:0,y:36,w:4,h:12}, {x:4,y:32,w:4,h:4}, {x:8,y:32,w:4,h:4}, {x:4,y:36,w:4,h:12}, {x:12,y:36,w:4,h:12} ],
        'leftLeg': [ {x:24,y:52,w:4,h:12}, {x:16,y:52,w:4,h:12}, {x:20,y:48,w:4,h:4}, {x:24,y:48,w:4,h:4}, {x:20,y:52,w:4,h:12}, {x:28,y:52,w:4,h:12} ],
        'leftLegOuter': [ {x:8,y:52,w:4,h:12}, {x:0,y:52,w:4,h:12}, {x:4,y:48,w:4,h:4}, {x:8,y:48,w:4,h:4}, {x:4,y:52,w:4,h:12}, {x:12,y:52,w:4,h:12} ]
    };

    const mats = []; let isLeg = ctx.canvas.height === 32, fM = isLeg && (partDef==='leftArm'||partDef==='leftLeg');
    if (isLeg && partDef.includes('Outer') && partDef !== 'headOuter') return new Array(6).fill(new THREE.MeshLambertMaterial({transparent:true,opacity:0}));

    for (let i=0; i<6; i++) {
        let fi = fM ? (i===0?1:i===1?0:i) : i;
        let info = {...(fM ? defs[partDef.replace('left','right')][fi] : defs[partDef][i])};
        if(segment==='upper' && [0,1,4,5].includes(i)) info.h /= 2;
        else if(segment==='lower' && [0,1,4,5].includes(i)){ info.h /= 2; info.y += info.h; }
        
        if(!info){ mats.push(new THREE.MeshLambertMaterial({transparent:true,opacity:0})); continue; }
        let imgD; try { imgD = ctx.getImageData(info.x,info.y,info.w,info.h); } catch(e){ imgD = ctx.createImageData(info.w,info.h); }
        const fcvs = document.createElement('canvas'); fcvs.width=info.w; fcvs.height=info.h;
        const fctx = fcvs.getContext('2d'); if(fM){ fctx.translate(info.w,0); fctx.scale(-1,1); }
        fctx.putImageData(imgD,0,0);
        const tex = new THREE.CanvasTexture(fcvs); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps=false;
        mats.push(new THREE.MeshLambertMaterial({map:tex,transparent:true,depthWrite:true,alphaTest:0.5}));
    }
    return mats;
}

function buildCharacter(id) {
    const data = { root: new THREE.Group(), groups: {}, materials: {}, items: {} }; scene.add(data.root); data.root.userData = {baseId:'glob',pid:id};
    const defM = new THREE.MeshLambertMaterial({color:0x555555}), defOM = new THREE.MeshLambertMaterial({color:0x000,transparent:true,opacity:0}); 

    const mkP = (name, pY, gY, geoD, baseId) => {
        const g = new THREE.Group(); g.position.set(...pY); g.userData = {baseId, pid:id};
        const m = new THREE.Mesh(new THREE.BoxGeometry(...geoD), defM); m.position.y=gY; g.add(m);
        const om = new THREE.Mesh(new THREE.BoxGeometry(geoD[0]+0.5,geoD[1]+0.25,geoD[2]+0.5), defOM); om.position.y=gY; g.add(om);
        return {g,m,om};
    };

    const bl = mkP('bLow', [0,DIM.leg[1],0], DIM.body[1]/4, [DIM.body[0],DIM.body[1]/2,DIM.body[2]], 'body'); data.groups.lowerBody=bl.g; data.root.add(bl.g);
    const bu = mkP('bUp', [0,DIM.body[1]/2,0], DIM.body[1]/4, [DIM.body[0],DIM.body[1]/2,DIM.body[2]], 'spine'); data.groups.upperBody=bu.g; bl.g.add(bu.g);
    const hd = mkP('head', [0,DIM.body[1]/2,0], DIM.head[1]/2, DIM.head, 'head'); data.groups.head=hd.g; bu.g.add(hd.g);
    hd.om.geometry = new THREE.BoxGeometry(DIM.head[0]+0.5,DIM.head[1]+0.5,DIM.head[2]+0.5);

    const buildLimb = (pre, p, pY_low, gY_up, bUp, bLow, pA) => {
        const halfHeight = DIM[pA][1] / 2;
        const u = mkP('u', p, gY_up, [DIM[pA][0], halfHeight, DIM[pA][2]], bUp); data.groups['upper'+pre] = u.g;
        const l = mkP('l', pY_low, -(halfHeight / 2), [DIM[pA][0], halfHeight, DIM[pA][2]], bLow); data.groups['lower'+pre] = l.g;
        u.g.add(l.g); return {u,l};
    };

    const al = buildLimb('LeftArm', [(DIM.body[0]/2)+(DIM.arm[0]/2), DIM.body[1]/2-2, 0], [0,-4,0], -1, 'larm', 'lelbow', 'arm'); bu.g.add(al.u.g);
    const ar = buildLimb('RightArm', [-(DIM.body[0]/2)-(DIM.arm[0]/2), DIM.body[1]/2-2, 0], [0,-4,0], -1, 'rarm', 'relbow', 'arm'); bu.g.add(ar.u.g);
    const ll = buildLimb('LeftLeg', [(DIM.body[0]/2)-(DIM.leg[0]/2), 0, 0], [0,-6,0], -3, 'lleg', 'lknee', 'leg'); bl.g.add(ll.u.g);
    const lr = buildLimb('RightLeg', [-(DIM.body[0]/2)+(DIM.leg[0]/2), 0, 0], [0,-6,0], -3, 'rleg', 'rknee', 'leg'); bl.g.add(lr.u.g);

    const ancL = new THREE.Group(); ancL.position.set(0,-6,0); al.l.g.add(ancL); data.groups.itemAnchorL = ancL;
    const ancR = new THREE.Group(); ancR.position.set(0,-6,0); ar.l.g.add(ancR); data.groups.itemAnchorR = ancR;

    data.materials = { bodyLower:bl.m, bodyLowerOuter:bl.om, bodyUpper:bu.m, bodyUpperOuter:bu.om, head:hd.m, headOuter:hd.om, leftArmUpper:al.u.m, leftArmUpperOuter:al.u.om, leftArmLower:al.l.m, leftArmLowerOuter:al.l.om, rightArmUpper:ar.u.m, rightArmUpperOuter:ar.u.om, rightArmLower:ar.l.m, rightArmLowerOuter:ar.l.om, leftLegUpper:ll.u.m, leftLegUpperOuter:ll.u.om, leftLegLower:ll.l.m, leftLegLowerOuter:ll.l.om, rightLegUpper:lr.u.m, rightLegUpperOuter:lr.u.om, rightLegLower:lr.l.m, rightLegLowerOuter:lr.l.om };
    data.root.position.y = -DIM.leg[1] - DIM.body[1]/2 + 8; 

    [1, 2].forEach(i => {
        const g = new THREE.Group(); g.userData={baseId:`item${i}`,pid:id}; g.add(new THREE.Mesh(new THREE.BoxGeometry(8,8,1), new THREE.MeshLambertMaterial({transparent:true,opacity:0})));
        g.rotation.set(Math.PI/2, i===1?Math.PI/4:-Math.PI/4, 0); g.visible = false; (i===1?ancR:ancL).add(g); data.items[`group${i}`]=g; data.items[`mesh${i}`]=null;
    });
    playersData[id] = data;
}

function createVoxelItem(img) {
    const cvs = document.createElement('canvas'); cvs.width=img.width; cvs.height=img.height;
    const ctx = cvs.getContext('2d'); ctx.drawImage(img,0,0);
    const d = ctx.getImageData(0,0,img.width,img.height).data;
    let sp = 0; for(let i=3; i<d.length; i+=4) if(d[i]>10) sp++;
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshLambertMaterial({color:0xffffff}), sp);
    const mat = new THREE.Matrix4(), col = new THREE.Color(); let idx=0;
    for(let y=0;y<img.height;y++) for(let x=0;x<img.width;x++) {
        const p=(y*img.width+x)*4; if(d[p+3]>10) {
            mat.setPosition(x-img.width/2+0.5, (img.height-y)-img.height/2-0.5, 0); im.setMatrixAt(idx, mat);
            col.setRGB(d[p]/255, d[p+1]/255, d[p+2]/255); im.setColorAt(idx, col); idx++;
        }
    }
    im.instanceMatrix.needsUpdate = true; if(im.instanceColor) im.instanceColor.needsUpdate = true; return im;
}

function loadSkinTexture(url, id) {
    playersData[id].skinUrl = url; const img = new Image(); img.crossOrigin = "Anonymous"; 
    img.onload = () => {
        const cvs = document.createElement('canvas'); cvs.width=img.width; cvs.height=img.height;
        const ctx = cvs.getContext('2d'); ctx.drawImage(img,0,0); const m = playersData[id].materials; if(!m) return;
        const b = (p,s) => createMaterialArrayForPart(ctx,p,s);
        m.head.material=b('head'); m.headOuter.material=b('headOuter');
        m.bodyUpper.material=b('body','upper'); m.bodyLower.material=b('body','lower');
        m.bodyUpperOuter.material=b('bodyOuter','upper'); m.bodyLowerOuter.material=b('bodyOuter','lower');
        m.leftArmUpper.material=b('leftArm','upper'); m.leftArmLower.material=b('leftArm','lower');
        m.leftArmUpperOuter.material=b('leftArmOuter','upper'); m.leftArmLowerOuter.material=b('leftArmOuter','lower');
        m.rightArmUpper.material=b('rightArm','upper'); m.rightArmLower.material=b('rightArm','lower');
        m.rightArmUpperOuter.material=b('rightArmOuter','upper'); m.rightArmLowerOuter.material=b('rightArmOuter','lower');
        m.leftLegUpper.material=b('leftLeg','upper'); m.leftLegLower.material=b('leftLeg','lower');
        m.leftLegUpperOuter.material=b('leftLegOuter','upper'); m.leftLegLowerOuter.material=b('leftLegOuter','lower');
        m.rightLegUpper.material=b('rightLeg','upper'); m.rightLegLower.material=b('rightLeg','lower');
        m.rightLegUpperOuter.material=b('rightLegOuter','upper'); m.rightLegLowerOuter.material=b('rightLegOuter','lower');
    }; img.src = url;
}

function loadItemTexture(url, idx, id) {
    const pd = playersData[id]; pd[`item${idx}Url`] = url; const img = new Image();
    img.onload = () => {
        const m = createVoxelItem(img), g = pd.items[`group${idx}`];
        while(g.children.length>0) g.remove(g.children[0]);
        pd.items[`mesh${idx}`] = m; g.add(m); g.visible = true;
        const cb = document.getElementById(`item${idx}-visible-${id}`); if(cb && !cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change')); }
        document.getElementById(`item${idx}-scale-${id}`).dispatchEvent(new Event('input'));
    }; img.src = url;
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
window.onload = init;