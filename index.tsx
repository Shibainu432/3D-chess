// Fix: Declare global variables injected at runtime or from CDNs to satisfy TypeScript.
// Fix: Since this file does not contain any top-level import/export statements, it's treated as a script, not a module.
// In a script file, we can augment global interfaces like `Window` directly without `declare global`.
interface Window {
    THREE: any;
}
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;

// Since Three.js is loaded from a CDN, it's attached to the window object.
// We assign it to a const to make it available in this module's scope.
const THREE = window.THREE;

// --- Firebase Setup (Required Global Boilerplate) ---
// Note: Firestore is not used for this single-player simulation, but variables are maintained.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Global Three.js Variables ---
let scene, camera, renderer;
let container: HTMLElement;
let boardGroup;
let currentSelectedPiece = null;
let currentValidMoves = []; 
let moveVisualizationsGroup; 
let turn = 'white'; 

// Camera control variables
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let rotationSpeed = 0.005;

// --- Game Constants ---
const SIZE = 8;
const CELL_SIZE = 7;
const GRID_COLOR = 0x3b82f6;
const GRID_OPACITY = 0.4;
const BOARD_BOUNDS = SIZE * CELL_SIZE;
const CENTER_OFFSET = BOARD_BOUNDS / 2 - (CELL_SIZE / 2);

const CAMERA_POS = 70;
const MIN_ZOOM = 30;
const MAX_ZOOM = 150;

const PIECE_SCALE = 0.4; // Adjusted for new models
const WHITE_COLOR = new THREE.Color(0xe0e0e0);
const BLACK_COLOR = new THREE.Color(0x1e1e1e);

// --- Scoring & Captured Pieces ---
const PIECE_VALUES = { 'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0 };
let capturedPieces = {
    white: [], // Pieces captured by White (i.e., Black pieces)
    black: [], // Pieces captured by Black (i.e., White pieces)
};
let materialAdvantage = 0;

// --- Game State Model ---
let boardState = Array(SIZE).fill(0).map(() => 
    Array(SIZE).fill(0).map(() => 
        Array(SIZE).fill(null)
    )
);

// --- 2D Board Constants ---
const BOARD_SIZE_2D = 8;
const CELL_SIZE_2D = 30; // Pixel size for each cell in the 2D view
const PIECE_SYMBOLS = {
    white: { 'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙' },
    black: { 'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟' }
};

// --- Piece Styling Functions (3D) ---
// NEW: Redesigned pieces with a classic Staunton look using LatheGeometry

function createStyledKing(scale, color) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: color, shininess: 50 });
    const points = [
        new THREE.Vector2(0, 0), new THREE.Vector2(3.5, 0), new THREE.Vector2(3.5, 1),
        new THREE.Vector2(3, 1), new THREE.Vector2(2, 2.5), new THREE.Vector2(2.2, 4.5),
        new THREE.Vector2(2, 6), new THREE.Vector2(2.5, 7.5), new THREE.Vector2(1.5, 9),
        new THREE.Vector2(2, 11.5), new THREE.Vector2(1, 12), new THREE.Vector2(0.5, 12.5),
        new THREE.Vector2(0, 12.5)
    ];
    const bodyGeom = new THREE.LatheGeometry(points, 32);
    const body = new THREE.Mesh(bodyGeom, material);
    group.add(body);

    const crossBarGeom = new THREE.BoxGeometry(0.8, 2, 0.8);
    const crossBar = new THREE.Mesh(crossBarGeom, material);
    crossBar.position.y = 13.5;
    group.add(crossBar);
    const crossArmGeom = new THREE.BoxGeometry(2, 0.8, 0.8);
    const crossArm = new THREE.Mesh(crossArmGeom, material);
    crossArm.position.y = 13.8;
    group.add(crossArm);

    group.scale.set(scale, scale, scale);
    group.castShadow = true;
    return group;
}

function createStyledQueen(scale, color) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: color, shininess: 50 });
    const points = [
        new THREE.Vector2(0, 0), new THREE.Vector2(3.5, 0), new THREE.Vector2(3.5, 1),
        new THREE.Vector2(3, 1), new THREE.Vector2(2, 2.5), new THREE.Vector2(2.5, 7.5),
        new THREE.Vector2(1.5, 9), new THREE.Vector2(3, 11), new THREE.Vector2(0, 11.5)
    ];
    const bodyGeom = new THREE.LatheGeometry(points, 32);
    const body = new THREE.Mesh(bodyGeom, material);
    group.add(body);

    const topSphereGeom = new THREE.SphereGeometry(0.7, 16, 16);
    const topSphere = new THREE.Mesh(topSphereGeom, material);
    topSphere.position.y = 12;
    group.add(topSphere);
    
    group.scale.set(scale, scale, scale);
    group.castShadow = true;
    return group;
}

function createStyledRook(scale, color) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: color, shininess: 50 });
    const points = [
        new THREE.Vector2(0, 0), new THREE.Vector2(3.5, 0), new THREE.Vector2(3.5, 1.5),
        new THREE.Vector2(2.5, 1.5), new THREE.Vector2(2.5, 8), new THREE.Vector2(3, 8),
        new THREE.Vector2(3, 9), new THREE.Vector2(0, 9)
    ];
    const bodyGeom = new THREE.LatheGeometry(points, 32);
    const body = new THREE.Mesh(bodyGeom, material);
    group.add(body);

    for (let i = 0; i < 6; i++) {
        const crenelationGeom = new THREE.BoxGeometry(1.2, 1.5, 1);
        const crenel = new THREE.Mesh(crenelationGeom, material);
        const angle = i * Math.PI / 3;
        crenel.position.set(
            Math.cos(angle) * 2.5,
            9.5,
            Math.sin(angle) * 2.5
        );
        crenel.lookAt(0, 9.5, 0);
        group.add(crenel);
    }

    group.scale.set(scale * 0.9, scale * 0.9, scale * 0.9);
    group.castShadow = true;
    return group;
}

function createStyledBishop(scale, color) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: color, shininess: 50 });
    const points = [
        new THREE.Vector2(0, 0), new THREE.Vector2(3, 0), new THREE.Vector2(3, 1),
        new THREE.Vector2(2.5, 1), new THREE.Vector2(1.5, 4), new THREE.Vector2(2, 8),
        new THREE.Vector2(0, 11)
    ];
    const bodyGeom = new THREE.LatheGeometry(points, 32);
    const body = new THREE.Mesh(bodyGeom, material);
    group.add(body);
    
    const mitreGeom = new THREE.CylinderGeometry(0, 1.8, 4, 32);
    const mitre = new THREE.Mesh(mitreGeom, material);
    mitre.position.y = 9.5;
    //group.add(mitre); // Simplified Bishop for now

    const sphereGeom = new THREE.SphereGeometry(0.5, 16, 16);
    const sphere = new THREE.Mesh(sphereGeom, material);
    sphere.position.y = 11;
    group.add(sphere);

    group.scale.set(scale, scale, scale);
    group.castShadow = true;
    return group;
}

function createStyledKnight(scale, color) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: color, shininess: 50 });
    
    // Base
    const basePoints = [
        new THREE.Vector2(0,0), new THREE.Vector2(3.5,0), new THREE.Vector2(3.5,1), new THREE.Vector2(2,2), new THREE.Vector2(2.5,4), new THREE.Vector2(0,4)
    ];
    const baseGeom = new THREE.LatheGeometry(basePoints, 32);
    const base = new THREE.Mesh(baseGeom, material);
    group.add(base);

    // Horse body
    const horseBodyGeom = new THREE.SphereGeometry(2, 32, 16);
    const horseBody = new THREE.Mesh(horseBodyGeom, material);
    horseBody.scale.set(1, 1.3, 1);
    horseBody.position.set(-0.5, 6, 0);
    horseBody.rotation.z = -0.3;
    group.add(horseBody);

    // Snout
    const snoutGeom = new THREE.CylinderGeometry(1, 0.7, 3, 16);
    const snout = new THREE.Mesh(snoutGeom, material);
    snout.position.set(1.5, 6.5, 0);
    snout.rotation.z = 1.2;
    group.add(snout);

    // Ears
    const earGeom = new THREE.ConeGeometry(0.4, 1.5, 8);
    const ear1 = new THREE.Mesh(earGeom, material);
    ear1.position.set(-2, 8, 0.6);
    ear1.rotation.x = 0.5;
    group.add(ear1);
    const ear2 = ear1.clone();
    ear2.position.z = -0.6;
    ear2.rotation.x = -0.5;
    group.add(ear2);

    group.rotation.y = -Math.PI / 2;
    group.scale.set(scale, scale, scale);
    group.castShadow = true;
    return group;
}

function createStyledPawn(scale, color) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: color, shininess: 50 });
    const points = [
        new THREE.Vector2(0, 0), new THREE.Vector2(2.5, 0), new THREE.Vector2(2.5, 1),
        new THREE.Vector2(2, 1), new THREE.Vector2(1.5, 3), new THREE.Vector2(2, 5), new THREE.Vector2(0, 5)
    ];
    const bodyGeom = new THREE.LatheGeometry(points, 32);
    const body = new THREE.Mesh(bodyGeom, material);
    group.add(body);

    const sphereGeom = new THREE.SphereGeometry(1.5, 32, 16);
    const sphere = new THREE.Mesh(sphereGeom, material);
    sphere.position.y = 5.5;
    group.add(sphere);

    group.scale.set(scale, scale, scale);
    group.position.y = -2;
    group.castShadow = true;
    return group;
}


// --- 3D Initialization and Board Setup ---

function getCellWorldPosition(x, y, z) {
    return new THREE.Vector3(
        x * CELL_SIZE - CENTER_OFFSET,
        z * CELL_SIZE - CENTER_OFFSET, 
        y * CELL_SIZE - CENTER_OFFSET
    );
}

function initializeBoardState() {
    boardState = Array(SIZE).fill(0).map(() => 
        Array(SIZE).fill(0).map(() => 
            Array(SIZE).fill(null)
        )
    );

    // NEW: Updated piece layout as per user request
    const MAJOR_PIECE_PATTERN = [
        "rnbqqbnr", 
        "nnbqqbnn", 
        "bbbqqbbb", 
        "qqqqkqqq", 
        "qqqqqqqq", 
        "bbbqqbbb", 
        "nnbqqbnn", 
        "rnbqqbnr"  
    ];

    const PAWN_PATTERN = [
        "pppppppp", 
        "pppppppp", 
        "pppppppp", 
        "pppppppp", 
        "pppppppp", 
        "pppppppp", 
        "pppppppp", 
        "pppppppp"  
    ];

    // Place black pieces
    for (let z = 0; z < 2; z++) { // Black pieces on layers 0 and 1
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const pieceType = z === 0 ? MAJOR_PIECE_PATTERN[y][x] : PAWN_PATTERN[y][x];
                if (pieceType !== '-') {
                    boardState[x][y][z] = { type: pieceType.toUpperCase(), color: 'black' };
                }
            }
        }
    }

    // Place white pieces
    for (let z = 6; z < 8; z++) { // White pieces on layers 6 and 7
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const pieceType = z === 7 ? MAJOR_PIECE_PATTERN[7-y][x] : PAWN_PATTERN[7-y][x];
                if (pieceType !== '-') {
                     boardState[x][y][z] = { type: pieceType.toUpperCase(), color: 'white' };
                }
            }
        }
    }
}

function createPiece3D(type, color) {
    const pieceColor = color === 'white' ? WHITE_COLOR : BLACK_COLOR;
    switch (type) {
        case 'K': return createStyledKing(PIECE_SCALE, pieceColor);
        case 'Q': return createStyledQueen(PIECE_SCALE, pieceColor);
        case 'R': return createStyledRook(PIECE_SCALE, pieceColor);
        case 'B': return createStyledBishop(PIECE_SCALE, pieceColor);
        case 'N': return createStyledKnight(PIECE_SCALE, pieceColor);
        case 'P': return createStyledPawn(PIECE_SCALE, pieceColor);
        default: return null;
    }
}

function populate3DBoard() {
    if (boardGroup) {
        scene.remove(boardGroup);
    }
    boardGroup = new THREE.Group();
    scene.add(boardGroup);

    for (let z = 0; z < SIZE; z++) {
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const pieceData = boardState[x][y][z];
                if (pieceData) {
                    const pieceMesh = createPiece3D(pieceData.type, pieceData.color);
                    if (pieceMesh) {
                        pieceMesh.position.copy(getCellWorldPosition(x, y, z));
                        pieceMesh.userData = { x, y, z, ...pieceData };
                        boardGroup.add(pieceMesh);
                    }
                }
            }
        }
    }
}

// --- 2D Drawing and Interaction ---

function draw2DBoards() {
    const layersContainer = document.getElementById('layers-container');
    if (!layersContainer) return;
    layersContainer.innerHTML = ''; // Clear previous canvases

    const selectedPieceLayer = currentSelectedPiece ? currentSelectedPiece.z : -1;

    for (let z = 0; z < SIZE; z++) {
        const container = document.createElement('div');
        container.className = 'layer-canvas-container';
        if (z === selectedPieceLayer) {
            container.classList.add('active');
        }

        const label = document.createElement('div');
        label.className = 'text-xs text-center font-mono bg-gray-700 w-full px-1';
        label.textContent = `Layer Z=${z}`;
        
        const canvas = document.createElement('canvas');
        canvas.width = BOARD_SIZE_2D * CELL_SIZE_2D;
        canvas.height = BOARD_SIZE_2D * CELL_SIZE_2D;
        canvas.dataset.z = z.toString();
        
        container.appendChild(label);
        container.appendChild(canvas);
        layersContainer.appendChild(container);

        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        
        draw2DLayer(ctx, z);

        canvas.addEventListener('click', (event) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            const clickX = (event.clientX - rect.left) * scaleX;
            const clickY = (event.clientY - rect.top) * scaleY;
            
            const x = Math.floor(clickX / CELL_SIZE_2D);
            const y = Math.floor(clickY / CELL_SIZE_2D);

            handle2DClick(x, y, z);
        });
    }
}

function draw2DLayer(ctx, z) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const validMovesForLayer = currentValidMoves.filter(move => move.z === z);

    for (let y = 0; y < BOARD_SIZE_2D; y++) {
        for (let x = 0; x < BOARD_SIZE_2D; x++) {
            const isWhiteSquare = (x + y) % 2 === 0;
            ctx.fillStyle = isWhiteSquare ? '#e2e8f0' : '#4a5568';
            ctx.fillRect(x * CELL_SIZE_2D, y * CELL_SIZE_2D, CELL_SIZE_2D, CELL_SIZE_2D);

            const piece = boardState[x][y][z];
            if (piece) {
                ctx.font = '24px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = piece.color === 'white' ? '#f7fafc' : '#1a202c';
                const symbol = PIECE_SYMBOLS[piece.color][piece.type];
                ctx.fillText(symbol, x * CELL_SIZE_2D + CELL_SIZE_2D / 2, y * CELL_SIZE_2D + CELL_SIZE_2D / 2);
            }
            
            // Highlight selected piece
            if (currentSelectedPiece && currentSelectedPiece.x === x && currentSelectedPiece.y === y && currentSelectedPiece.z === z) {
                ctx.strokeStyle = '#f59e0b'; // Amber-500
                ctx.lineWidth = 2;
                ctx.strokeRect(x * CELL_SIZE_2D, y * CELL_SIZE_2D, CELL_SIZE_2D, CELL_SIZE_2D);
            }
        }
    }
    
    // Draw valid move indicators
    validMovesForLayer.forEach(move => {
        ctx.beginPath();
        ctx.arc(
            move.x * CELL_SIZE_2D + CELL_SIZE_2D / 2, 
            move.y * CELL_SIZE_2D + CELL_SIZE_2D / 2, 
            CELL_SIZE_2D / 4, 
            0, 2 * Math.PI
        );
        ctx.fillStyle = boardState[move.x][move.y][z] ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 197, 94, 0.7)'; // Red for capture, Green for empty
        ctx.fill();
    });
}


function handle2DClick(x, y, z) {
    const piece = boardState[x][y][z];

    // Check if the click is on a valid move
    const isMoveValid = currentValidMoves.some(move => move.x === x && move.y === y && move.z === z);
    if (isMoveValid && currentSelectedPiece) {
        movePiece(currentSelectedPiece, { x, y, z });
        return;
    }

    // Deselect if clicking the same piece again or empty square
    if (!piece || (currentSelectedPiece && currentSelectedPiece.x === x && currentSelectedPiece.y === y && currentSelectedPiece.z === z)) {
        currentSelectedPiece = null;
        currentValidMoves = [];
    } 
    // Select a new piece of the correct color
    else if (piece.color === turn) {
        currentSelectedPiece = { x, y, z, ...piece };
        currentValidMoves = calculateValidMoves(currentSelectedPiece);
    }
    
    draw2DBoards();
    visualizeValidMoves();
}


// --- Game Logic ---

function calculateValidMoves(piece) {
    const moves = [];
    if (!piece) return moves;

    const { x, y, z, type, color } = piece;
    
    // Helper to add a single move after checking bounds and target
    const addMove = (nx, ny, nz) => {
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && nz >= 0 && nz < SIZE) {
            const target = boardState[nx][ny][nz];
            if (!target || target.color !== color) {
                moves.push({ x: nx, y: ny, z: nz });
            }
        }
    };
    
    // Helper for sliding pieces (Rook, Bishop, Queen)
    const addSlidingMoves = (directions) => {
        for (const dir of directions) {
            for (let i = 1; i < SIZE; i++) {
                const nx = x + i * dir.x;
                const ny = y + i * dir.y;
                const nz = z + i * dir.z;

                if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE || nz < 0 || nz >= SIZE) {
                    break; // Out of bounds
                }

                const target = boardState[nx][ny][nz];
                if (target) {
                    if (target.color !== color) {
                        moves.push({ x: nx, y: ny, z: nz }); // Capture
                    }
                    break; // Blocked by own or enemy piece
                }
                moves.push({ x: nx, y: ny, z: nz }); // Empty square
            }
        }
    };

    switch (type) {
        case 'P': {
            const dir = color === 'white' ? -1 : 1;
            const startZ = color === 'white' ? 6 : 1;

            // Forward one step (Z-axis only)
            const oneStepZ = z + dir;
            if (oneStepZ >= 0 && oneStepZ < SIZE && !boardState[x][y][oneStepZ]) {
                moves.push({ x, y, z: oneStepZ });

                // Forward two steps from start
                if (z === startZ) {
                    const twoStepsZ = z + 2 * dir;
                    if (twoStepsZ >= 0 && twoStepsZ < SIZE && !boardState[x][y][twoStepsZ]) {
                        moves.push({ x, y, z: twoStepsZ });
                    }
                }
            }

            // Captures (8 diagonal directions on the next Z-layer)
            const captureZ = z + dir;
            if (captureZ >= 0 && captureZ < SIZE) {
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue; 
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
                            const target = boardState[nx][ny][captureZ];
                            if (target && target.color !== color) {
                                moves.push({ x: nx, y: ny, z: captureZ });
                            }
                        }
                    }
                }
            }
            break;
        }
        case 'N': { // Knight
            const knightMoves = [
                [1, 2, 0], [1, -2, 0], [-1, 2, 0], [-1, -2, 0],
                [2, 1, 0], [2, -1, 0], [-2, 1, 0], [-2, -1, 0],
                [1, 0, 2], [1, 0, -2], [-1, 0, 2], [-1, 0, -2],
                [2, 0, 1], [2, 0, -1], [-2, 0, 1], [-2, 0, -1],
                [0, 1, 2], [0, 1, -2], [0, -1, 2], [0, -1, -2],
                [0, 2, 1], [0, 2, -1], [0, -2, 1], [0, -2, -1]
            ];
            for (const move of knightMoves) {
                addMove(x + move[0], y + move[1], z + move[2]);
            }
            break;
        }
        case 'B': { // Bishop
            const bishopDirections = [
                // Planar diagonals
                { x: 1, y: 1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: -1, y: 1, z: 0 }, { x: -1, y: -1, z: 0 },
                { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 }, { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 },
                { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: -1 }, { x: 0, y: -1, z: 1 }, { x: 0, y: -1, z: -1 },
                // Space diagonals
                { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: -1, z: -1 },
                { x: -1, y: 1, z: 1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }, { x: -1, y: -1, z: -1 }
            ];
            addSlidingMoves(bishopDirections);
            break;
        }
        case 'R': { // Rook
            const rookDirections = [
                { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
                { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
                { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
            ];
            addSlidingMoves(rookDirections);
            break;
        }
        case 'Q': { // Queen
            const queenDirections = [
                // Rook
                { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
                // Bishop
                { x: 1, y: 1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: -1, y: 1, z: 0 }, { x: -1, y: -1, z: 0 },
                { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 }, { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 },
                { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: -1 }, { x: 0, y: -1, z: 1 }, { x: 0, y: -1, z: -1 },
                { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: -1, z: -1 },
                { x: -1, y: 1, z: 1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }, { x: -1, y: -1, z: -1 }
            ];
            addSlidingMoves(queenDirections);
            break;
        }
        case 'K': { // King
            for (let dz = -1; dz <= 1; dz++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0 && dz === 0) continue;
                        addMove(x + dx, y + dy, z + dz);
                    }
                }
            }
            break;
        }
    }

    return moves;
}

function movePiece(from, to) {
    const pieceToMove = boardState[from.x][from.y][from.z];
    const capturedPiece = boardState[to.x][to.y][to.z];

    if (capturedPiece) {
        if (capturedPiece.color === 'white') {
            capturedPieces.black.push(capturedPiece.type);
        } else {
            capturedPieces.white.push(capturedPiece.type);
        }
    }
    
    boardState[to.x][to.y][to.z] = pieceToMove;
    boardState[from.x][from.y][from.z] = null;

    // Switch turns
    turn = (turn === 'white') ? 'black' : 'white';

    // Reset selection
    currentSelectedPiece = null;
    currentValidMoves = [];

    // Redraw everything
    populate3DBoard();
    draw2DBoards();
    visualizeValidMoves();
    updateScoreAndTurn();
}

function updateScoreAndTurn() {
    const turnIndicator = document.getElementById('turn-indicator-large');
    if (turnIndicator) {
        turnIndicator.textContent = turn.toUpperCase();
        turnIndicator.style.color = turn === 'white' ? '#FFFFFF' : '#cccccc';
    }

    // Calculate material advantage
    const calculateScore = (pieces) => pieces.reduce((acc, type) => acc + PIECE_VALUES[type], 0);
    const whiteCapturedScore = calculateScore(capturedPieces.white);
    const blackCapturedScore = calculateScore(capturedPieces.black);
    materialAdvantage = whiteCapturedScore - blackCapturedScore;

    const advantageText = document.getElementById('material-advantage-text');
    if (advantageText) {
        if (materialAdvantage > 0) {
            advantageText.textContent = `+${materialAdvantage}`;
            advantageText.style.color = '#FFFFFF';
        } else if (materialAdvantage < 0) {
            advantageText.textContent = `${materialAdvantage}`;
            advantageText.style.color = '#cccccc';
        } else {
            advantageText.textContent = '';
        }
    }

    // Update captured pieces display
    const capturedByBlackDiv = document.getElementById('captured-by-black');
    if (capturedByBlackDiv) {
        capturedByBlackDiv.innerHTML = capturedPieces.black.map(p => PIECE_SYMBOLS.white[p]).join(' ');
    }
    const capturedByWhiteDiv = document.getElementById('captured-by-white');
    if (capturedByWhiteDiv) {
        capturedByWhiteDiv.innerHTML = capturedPieces.white.map(p => PIECE_SYMBOLS.black[p]).join(' ');
    }

    // Update score panels
    const blackScorePanel = document.getElementById('black-score-panel');
    const whiteScorePanel = document.getElementById('white-score-panel');
    if (blackScorePanel && whiteScorePanel) {
        if (turn === 'black') {
            blackScorePanel.style.borderColor = '#f59e0b';
            whiteScorePanel.style.borderColor = '#4b5563';
        } else {
            whiteScorePanel.style.borderColor = '#f59e0b';
            blackScorePanel.style.borderColor = '#4b5563';
        }
    }
}

function visualizeValidMoves() {
    if (moveVisualizationsGroup) {
        scene.remove(moveVisualizationsGroup);
    }
    moveVisualizationsGroup = new THREE.Group();
    scene.add(moveVisualizationsGroup);

    if (currentValidMoves.length === 0) {
        return;
    }

    currentValidMoves.forEach(move => {
        const isCapture = !!boardState[move.x][move.y][move.z];
        const color = isCapture ? 0xff4444 : 0x44ff44;
        const geometry = new THREE.SphereGeometry(CELL_SIZE * 0.15, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6 });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(getCellWorldPosition(move.x, move.y, move.z));
        moveVisualizationsGroup.add(sphere);
    });
}


// --- Main Initialization ---

function init() {
    container = document.getElementById('game-container') as HTMLElement;
    const boardPanel = document.getElementById('board-panel') as HTMLElement;
    if (!container || !boardPanel) {
        console.error("Required DOM elements not found.");
        return;
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a202c);
    scene.fog = new THREE.Fog(0x1a202c, 100, 250);

    // Camera
    camera = new THREE.PerspectiveCamera(50, boardPanel.clientWidth / boardPanel.clientHeight, 0.1, 1000);
    // Fix: Corrected typo from CAMERA_pos to CAMERA_POS
    camera.position.set(CAMERA_POS, CAMERA_POS, CAMERA_POS);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(boardPanel.clientWidth, boardPanel.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 75);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // NEW: Volumetric Board Grid
    const gridGroup = new THREE.Group();
    const material = new THREE.LineBasicMaterial({ color: GRID_COLOR, transparent: true, opacity: GRID_OPACITY });
    const halfBounds = BOARD_BOUNDS / 2;

    // Create horizontal grid planes for each layer
    for (let level = 0; level <= SIZE; level++) {
        const y = level * CELL_SIZE - halfBounds; // world Y is game Z
        for (let i = 0; i <= SIZE; i++) {
            const pos = i * CELL_SIZE - halfBounds;
            // Lines parallel to world Z
            let pointsZ = [new THREE.Vector3(-halfBounds, y, pos), new THREE.Vector3(halfBounds, y, pos)];
            gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pointsZ), material));
            // Lines parallel to world X
            let pointsX = [new THREE.Vector3(pos, y, -halfBounds), new THREE.Vector3(pos, y, halfBounds)];
            gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pointsX), material));
        }
    }

    // Create vertical lines connecting the planes
    for (let i = 0; i <= SIZE; i++) {
        const x = i * CELL_SIZE - halfBounds;
        for (let j = 0; j <= SIZE; j++) {
            const z = j * CELL_SIZE - halfBounds;
            let pointsY = [new THREE.Vector3(x, -halfBounds, z), new THREE.Vector3(x, halfBounds, z)];
            gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pointsY), material));
        }
    }
    scene.add(gridGroup);

    // Mouse Controls
    boardPanel.addEventListener('mousedown', (e) => { isDragging = true; previousMousePosition.x = e.clientX; previousMousePosition.y = e.clientY; });
    boardPanel.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            // Rotate the entire scene for a more intuitive feel
            const rotationObject = scene; // Rotate scene instead of just boardGroup
            
            // Create a quaternion for rotation around the world Y axis
            const quatY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * rotationSpeed);
            
            // Create a quaternion for rotation around the world X axis
            const quatX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaY * rotationSpeed);
            
            // Combine rotations
            rotationObject.quaternion.multiplyQuaternions(quatY, rotationObject.quaternion);
            rotationObject.quaternion.multiplyQuaternions(quatX, rotationObject.quaternion);
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });
    boardPanel.addEventListener('mouseup', () => { isDragging = false; });
    boardPanel.addEventListener('mouseleave', () => { isDragging = false; });
    boardPanel.addEventListener('wheel', (e) => {
        camera.position.z *= (1 + e.deltaY * 0.001);
        camera.position.x *= (1 + e.deltaY * 0.001);
        camera.position.y *= (1 + e.deltaY * 0.001);
        camera.position.clampLength(MIN_ZOOM, MAX_ZOOM);
    });

    // --- Panel Resizing Logic ---
    const infoPanel = document.getElementById('info-panel') as HTMLElement;
    const resizer = document.getElementById('resizer') as HTMLElement;

    const handleThreeResize = () => {
        if (!camera || !renderer || !boardPanel) return;

        const width = boardPanel.clientWidth;
        const height = boardPanel.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    };
    
    window.addEventListener('resize', handleThreeResize);
    
    let isResizingPanel = false;
    
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizingPanel = true;
        document.body.classList.add('resizing');
        
        const mouseMoveHandler = (e: MouseEvent) => {
            if (!isResizingPanel) return;
            const newWidth = e.clientX;
            const minWidth = 300; 
            const maxWidth = window.innerWidth * 0.5;

            if (newWidth >= minWidth && newWidth <= maxWidth) {
                infoPanel.style.width = `${newWidth}px`;
                handleThreeResize(); // Update the 3D canvas size
            }
        };

        const mouseUpHandler = () => {
            isResizingPanel = false;
            document.body.classList.remove('resizing');
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        };

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });

    // Initial setup
    initializeBoardState();
    populate3DBoard();
    draw2DBoards();
    updateScoreAndTurn();
    handleThreeResize();
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Start everything
init();
animate();
