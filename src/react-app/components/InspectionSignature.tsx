import React, { useRef, useEffect, useState } from 'react';
import { Save, RotateCcw, Pen } from 'lucide-react';

interface InspectionSignatureProps {
  onSignatureSaved: (signature: string) => void;
  existingSignature?: string;
  signerName: string;
  signerRole: string;
  readonly?: boolean;
}

export default function InspectionSignature({
  onSignatureSaved,
  existingSignature,
  signerName,
  signerRole,
  readonly = false
}: InspectionSignatureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!existingSignature);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = 400;
    canvas.height = 200;

    // Set line properties
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';

    // Clear canvas with white background first
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load existing signature if available
    if (existingSignature && existingSignature.trim() !== '') {
      console.log(`Loading existing signature for ${signerName}:`, existingSignature.substring(0, 50) + '...');
      const img = new Image();
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          setHasSignature(true);
          console.log(`Successfully loaded signature for ${signerName}`);
        } catch (error) {
          console.error(`Error drawing signature for ${signerName}:`, error);
        }
      };
      img.onerror = (error) => {
        console.error(`Error loading signature image for ${signerName}:`, error);
      };
      img.src = existingSignature;
    }
  }, [existingSignature, signerName]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (readonly) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || readonly) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    if (readonly) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    try {
      const dataURL = canvas.toDataURL('image/png');
      console.log(`Saving signature for ${signerName}:`, dataURL.substring(0, 50) + '...');
      onSignatureSaved(dataURL);
    } catch (error) {
      console.error('Error generating signature:', error);
      alert('Erro ao salvar assinatura. Tente novamente.');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="mb-4">
        <h3 className="font-medium text-slate-900 mb-1">Assinatura Digital</h3>
        <div className="text-sm text-slate-600">
          <p><span className="font-medium">Nome:</span> {signerName}</p>
          <p><span className="font-medium">Cargo:</span> {signerRole}</p>
          <p><span className="font-medium">Data:</span> {new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="border border-slate-300 rounded cursor-crosshair w-full h-48"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          style={{ touchAction: 'none', minHeight: '200px' }}
        />
        
        {!readonly && !hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-slate-400">
              <Pen className="w-5 h-5" />
              <span className="text-sm">Assine aqui</span>
            </div>
          </div>
        )}
      </div>

      {!readonly && (
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={clearSignature}
            className="flex items-center px-3 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Limpar
          </button>
          <button
            type="button"
            onClick={saveSignature}
            disabled={!hasSignature}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            Salvar Assinatura
          </button>
        </div>
      )}
    </div>
  );
}
