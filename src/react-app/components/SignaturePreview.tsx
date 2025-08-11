import { PenTool } from 'lucide-react';

interface SignaturePreviewProps {
  signature?: string;
  signerName: string;
  signerRole: string;
  title: string;
  showDate?: boolean;
}

export default function SignaturePreview({
  signature,
  signerName,
  signerRole,
  title,
  showDate = true
}: SignaturePreviewProps) {
  const hasSignature = signature && signature.trim() !== '';

  return (
    <div className="border border-slate-200 rounded-lg p-4 print:border-gray-400">
      <h3 className={`font-medium mb-2 ${hasSignature ? 'text-slate-900' : 'text-slate-500'}`}>
        {title}
      </h3>
      
      <div className={`rounded p-3 mb-2 min-h-[80px] flex items-center justify-center ${
        hasSignature ? 'bg-slate-50 print:bg-gray-100' : 'bg-slate-100'
      }`}>
        {hasSignature ? (
          <img 
            src={signature} 
            alt={title}
            className="max-h-16 max-w-full object-contain"
            style={{
              WebkitPrintColorAdjust: 'exact',
              colorAdjust: 'exact'
            }}
            onError={(e) => {
              console.error(`Error loading signature image for ${title}`);
              const img = e.target as HTMLImageElement;
              img.style.display = 'none';
              // Show error state
              const parent = img.parentElement;
              if (parent) {
                parent.innerHTML = `
                  <div class="flex items-center gap-2 text-red-500">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <span class="text-sm">Erro ao carregar assinatura</span>
                  </div>
                `;
              }
            }}
            onLoad={() => {
              console.log(`${title} loaded successfully`);
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <PenTool className="w-6 h-6" />
            <span className="text-sm italic">Assinatura não disponível</span>
          </div>
        )}
      </div>
      
      <div className={`text-sm ${hasSignature ? 'text-slate-600' : 'text-slate-500'}`}>
        <p><strong>Nome:</strong> {signerName}</p>
        <p><strong>Cargo:</strong> {signerRole}</p>
        {showDate && (
          <p><strong>Data:</strong> {new Date().toLocaleDateString('pt-BR')}</p>
        )}
      </div>
    </div>
  );
}
