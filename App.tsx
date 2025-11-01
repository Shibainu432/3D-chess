import React, { useState, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { Piece, BoardState, Move } from './types';
import { calculateValidMoves, initializeBoardState } from './lib/gameLogic';
import InfoPanel from './components/InfoPanel';
import ThreeScene from './components/ThreeScene';
import PromotionModal from './components/PromotionModal';
import { GoogleGenAI, Type } from "@google/genai";
import { loadAssets } from './lib/threeUtils';

const App: React.FC = () => {
  const [boardState, setBoardState] = useState<BoardState>(() => initializeBoardState());
  const [turn, setTurn] = useState<'white' | 'black'>('white');
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[], black: Piece[] }>({ white: [], black: [] });
  const [gameStatus, setGameStatus] = useState('active');
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [promotionData, setPromotionData] = useState<{ piece: Piece, x: number, y: number, z: number } | null>(null);
  const [pieceModels, setPieceModels] = useState<Record<string, THREE.Object3D> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading Default 3D Models...');
  const [hoveredSquare, setHoveredSquare] = useState<{ x: number, y: number, z: number } | null>(null);

  // Effect for initial default model load
  useEffect(() => {
    const loadDefaultModels = async () => {
      try {
        // Here we can use a pre-defined mapping for the default model
        const defaultMapping: Record<Piece['type'], string> = {
          P: 'Modern_Pawn', R: 'Modern_Rook', N: 'Modern_Knight',
          B: 'Modern_Bishop', Q: 'Modern_Queen', K: 'Modern_King'
        };
        const models = await loadAssets(undefined, defaultMapping); // Pass undefined to use internal file
        setPieceModels(models);
      } catch (error) {
        console.error("Failed to load default 3D assets:", error);
        alert("A critical error occurred while loading default 3D models. Please refresh the page.");
      } finally {
        setIsLoading(false);
      }
    };
    loadDefaultModels();
  }, []);


  useEffect(() => {
    if (selectedPiece) {
      setValidMoves(calculateValidMoves(selectedPiece, boardState));
    } else {
      setValidMoves([]);
    }
  }, [selectedPiece, boardState]);

  const executeMove = useCallback((piece: Piece, targetX: number, targetY: number, targetZ: number, move: Move) => {
    const { x: oldX, y: oldY, z: oldZ, color } = piece;

    const promotionRank = color === 'white' ? 7 : 0;
    if (piece.type === 'P' && targetZ === promotionRank) {
        setPromotionData({ piece, x: targetX, y: targetY, z: targetZ });
        return;
    }

    const newBoardState = JSON.parse(JSON.stringify(boardState));
    const targetPiece = newBoardState[targetX][targetY][targetZ];
    
    if (targetPiece) {
        if (targetPiece.type === 'K') {
            setGameStatus(`${color.toUpperCase()} WINS!`);
        }
        const opponentColor = color === 'white' ? 'black' : 'white';
        setCapturedPieces(prev => ({
            ...prev,
            [opponentColor]: [...prev[opponentColor], targetPiece]
        }));
    }

    newBoardState[oldX][oldY][oldZ] = null;

    if (move.castle) {
        const movedKing = { ...piece, x: targetX, y: targetY, z: targetZ, hasMoved: true };
        newBoardState[targetX][targetY][targetZ] = movedKing;

        if (move.castle === 'king') {
            const rook = newBoardState[7][targetY][targetZ];
            if(rook) {
                newBoardState[7][targetY][targetZ] = null;
                rook.x = targetX - 1;
                rook.hasMoved = true;
                newBoardState[targetX - 1][targetY][targetZ] = rook;
            }
        } else { // Queenside
            const rook = newBoardState[0][targetY][targetZ];
            if(rook) {
                newBoardState[0][targetY][targetZ] = null;
                rook.x = targetX + 1;
                rook.hasMoved = true;
                newBoardState[targetX + 1][targetY][targetZ] = rook;
            }
        }
    } else {
        const movedPiece = { ...piece, x: targetX, y: targetY, z: targetZ, hasMoved: true };
        newBoardState[targetX][targetY][targetZ] = movedPiece;
    }
    
    setBoardState(newBoardState);
    setTurn(t => t === 'white' ? 'black' : 'white');
    setSelectedPiece(null);
  }, [boardState]);


  const handleSquareClick = useCallback((x: number, y: number, z: number) => {
    if (gameStatus !== 'active' || promotionData) return;

    const clickedPiece = boardState[x][y][z];

    if (selectedPiece) {
        const move = validMoves.find(m => m.x === x && m.y === y && m.z === z);
        if (move) {
            executeMove(selectedPiece, x, y, z, move);
            return;
        }

        if (clickedPiece && clickedPiece.color === turn) {
            setSelectedPiece(clickedPiece);
        } else {
            setSelectedPiece(null);
        }
    } else {
        if (clickedPiece && clickedPiece.color === turn) {
            setSelectedPiece(clickedPiece);
        }
    }
  }, [boardState, selectedPiece, validMoves, turn, executeMove, gameStatus, promotionData]);
  
  const handlePromotion = (promotedTo: Piece['type']) => {
    if (!promotionData) return;
    const { piece, x, y, z } = promotionData;
    
    const newBoardState = JSON.parse(JSON.stringify(boardState));

    newBoardState[piece.x][piece.y][piece.z] = null;
    
    const targetPiece = newBoardState[x][y][z];
    if (targetPiece) {
        if (targetPiece.type === 'K') {
            setGameStatus(`${piece.color.toUpperCase()} WINS!`);
        }
        const opponentColor = piece.color === 'white' ? 'black' : 'white';
        setCapturedPieces(prev => ({
            ...prev,
            [opponentColor]: [...prev[opponentColor], targetPiece]
        }));
    }
    
    newBoardState[x][y][z] = {
        type: promotedTo,
        color: piece.color,
        x, y, z,
        hasMoved: true,
    };

    setBoardState(newBoardState);
    setTurn(t => t === 'white' ? 'black' : 'white');
    setSelectedPiece(null);
    setPromotionData(null);
  };

  const handleCustomModelLoad = async (fileContent: string) => {
    setIsLoading(true);
    setLoadingMessage('Analyzing 3D Model with AI...');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const prompt = `Analyze the following .obj file content. Your task is to identify the object names for each of the 6 standard chess pieces: Pawn, Rook, Knight, Bishop, Queen, and King. The object names are on lines starting with "o ".

As a hint, artists often model the pieces in order of importance, from King down to Pawn (K, Q, B, N, R, P). Use this ordering as a strong clue if the object names are generic (e.g., "piece_1", "piece_2").

Your response must be a valid JSON object.
The keys of the JSON must be the standard one-letter abbreviations (P, R, N, B, Q, K).
The values must be the corresponding object names found in the file, but WITHOUT the leading "o " prefix. For example, if you find "o MyCoolKnight", the value should be "MyCoolKnight".

Do not include any markdown, explanations, or any text other than the single, valid JSON object.

FILE CONTENT:
${fileContent}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              'P': { type: Type.STRING },
              'R': { type: Type.STRING },
              'N': { type: Type.STRING },
              'B': { type: Type.STRING },
              'Q': { type: Type.STRING },
              'K': { type: Type.STRING },
            },
            required: ['P', 'R', 'N', 'B', 'Q', 'K']
          }
        }
      });
      
      const mapping = JSON.parse(response.text);
      setLoadingMessage('Slicing file and loading models...');

      const models = await loadAssets(fileContent, mapping);
      setPieceModels(models);

    } catch (error) {
      console.error("AI analysis or model loading failed:", error);
      alert("AI analysis or model loading failed:\n" + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startX = mouseDownEvent.clientX;
    const startWidth = sidebarWidth;

    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const newWidth = startWidth + mouseMoveEvent.clientX - startX;
      const minWidth = 280;
      const maxWidth = 600;
      if (newWidth > minWidth && newWidth < maxWidth) {
        setSidebarWidth(newWidth);
      }
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  }, [sidebarWidth]);

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen bg-gray-900 text-white overflow-hidden">
      {promotionData && <PromotionModal color={promotionData.piece.color} onPromote={handlePromotion} />}
      <div 
        style={{ width: `${sidebarWidth}px` }}
        className="flex-shrink-0 h-full"
      >
        <InfoPanel 
          turn={turn}
          capturedPieces={capturedPieces}
          boardState={boardState}
          selectedPiece={selectedPiece}
          validMoves={validMoves}
          onSquareClick={handleSquareClick}
          onSquareHover={setHoveredSquare}
          onCustomModelLoad={handleCustomModelLoad}
          gameStatus={gameStatus}
        />
      </div>
      
      <div 
        className="w-2 cursor-col-resize bg-gray-700 hover:bg-pink-400 transition-colors duration-200 flex-shrink-0"
        onMouseDown={startResizing}
        aria-label="Resize sidebar"
        role="separator"
      />

      <div className="flex-grow h-full relative">
        <ThreeScene 
            boardState={boardState}
            selectedPiece={selectedPiece}
            validMoves={validMoves}
            pieceModels={pieceModels}
            isLoading={isLoading}
            loadingMessage={loadingMessage}
            hoveredSquare={hoveredSquare}
        />
      </div>
    </div>
  );
};

export default App;