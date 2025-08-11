import { useState, useRef } from 'react';
import { Upload, X, Image, Video, Mic, FileText, Pause, Camera } from 'lucide-react';
import { InspectionMediaType } from '@/shared/types';

interface MediaUploadProps {
  inspectionId: number;
  inspectionItemId?: number;
  onMediaUploaded: (media: InspectionMediaType) => void;
  existingMedia?: InspectionMediaType[];
  onMediaDeleted?: (mediaId: number) => void;
}

export default function MediaUpload({ 
  inspectionId, 
  inspectionItemId, 
  onMediaUploaded, 
  existingMedia = [],
  onMediaDeleted 
}: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [audioRecording, setAudioRecording] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    
    try {
      // Convert file to base64 for upload to backend
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const mediaType = getMediaType(file.type);
      
      const response = await fetch(`/api/inspections/${inspectionId}/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inspection_id: inspectionId,
          inspection_item_id: inspectionItemId,
          media_type: mediaType,
          file_name: file.name,
          file_data: fileData,
          file_size: file.size,
          mime_type: file.type,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        onMediaUploaded({
          id: result.id,
          inspection_id: inspectionId,
          inspection_item_id: inspectionItemId,
          media_type: mediaType,
          file_name: file.name,
          file_url: result.file_url, // Use the public URL returned by backend
          file_size: file.size,
          mime_type: file.type,
        });
      } else {
        throw new Error('Erro ao fazer upload');
      }
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload do arquivo');
    } finally {
      setUploading(false);
    }
  };

  const getMediaType = (mimeType: string): 'image' | 'video' | 'audio' | 'document' => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const startPhotoCapture = async () => {
    try {
      setTakingPhoto(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          facingMode: 'environment' // Preferir câmera traseira no mobile
        } 
      });
      
      if (photoVideoRef.current) {
        photoVideoRef.current.srcObject = stream;
        photoVideoRef.current.play();
      }
    } catch (error) {
      console.error('Erro ao acessar câmera:', error);
      alert('Erro ao acessar câmera. Verifique as permissões.');
      setTakingPhoto(false);
    }
  };

  const capturePhoto = async () => {
    if (!photoVideoRef.current || !canvasRef.current) return;
    
    const video = photoVideoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw the current frame from video to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert canvas to blob
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      
      const file = new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
      await uploadFile(file);
      
      // Stop camera stream
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      setTakingPhoto(false);
    }, 'image/jpeg', 0.9);
  };

  const cancelPhotoCapture = () => {
    if (photoVideoRef.current) {
      const stream = photoVideoRef.current.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      photoVideoRef.current.srcObject = null;
    }
    setTakingPhoto(false);
  };

  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' });
        await uploadFile(file);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setAudioRecording(true);
      setRecordingTime(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      alert('Erro ao acessar microfone');
    }
  };

  const startVideoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720 }, 
        audio: true 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const file = new File([blob], `video-${Date.now()}.webm`, { type: 'video/webm' });
        await uploadFile(file);
        stream.getTracks().forEach(track => track.stop());
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setVideoRecording(true);
      setRecordingTime(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 15) {
            stopRecording();
            return 15;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Erro ao iniciar gravação de vídeo:', error);
      alert('Erro ao acessar câmera');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    
    setAudioRecording(false);
    setVideoRecording(false);
    setMediaRecorder(null);
    setRecordingTime(0);
  };

  const deleteMedia = async (mediaId: number) => {
    try {
      const response = await fetch(`/api/inspection-media/${mediaId}`, {
        method: 'DELETE',
      });

      if (response.ok && onMediaDeleted) {
        onMediaDeleted(mediaId);
      }
    } catch (error) {
      console.error('Erro ao deletar mídia:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getMediaIcon = (mediaType: string) => {
    switch (mediaType) {
      case 'image': return <Image className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'audio': return <Mic className="w-5 h-5" />;
      default: return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Controls */}
      <div className="border-2 border-dashed border-slate-300 rounded-lg p-6">
        <div className="text-center">
          <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            Adicionar Mídias
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Tire fotos, grave vídeos, áudio ou faça upload de arquivos
          </p>
          
          <div className="flex justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || takingPhoto}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Upload className="w-4 h-4 mr-2" />
              Arquivos
            </button>
            
            <button
              type="button"
              onClick={startPhotoCapture}
              disabled={uploading || takingPhoto || audioRecording || videoRecording}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              <Camera className="w-4 h-4 mr-2" />
              Tirar Foto
            </button>
            
            <button
              type="button"
              onClick={audioRecording ? stopRecording : startAudioRecording}
              disabled={uploading || videoRecording || takingPhoto}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                audioRecording 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              } disabled:opacity-50`}
            >
              {audioRecording ? <Pause className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              {audioRecording ? `Parar (${formatTime(recordingTime)})` : 'Gravar Áudio'}
            </button>
            
            <button
              type="button"
              onClick={videoRecording ? stopRecording : startVideoRecording}
              disabled={uploading || audioRecording || takingPhoto}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                videoRecording 
                  ? 'bg-red-600 hover:bg-red-700 text-white' 
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              } disabled:opacity-50`}
            >
              {videoRecording ? <Pause className="w-4 h-4 mr-2" /> : <Video className="w-4 h-4 mr-2" />}
              {videoRecording ? `Parar (${formatTime(recordingTime)}/15s)` : 'Gravar Vídeo'}
            </button>
          </div>
          
          {uploading && (
            <div className="mt-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-slate-600 mt-2">Fazendo upload...</p>
            </div>
          )}
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {/* Photo Capture Modal */}
      {takingPhoto && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <div className="text-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Tirar Foto</h3>
              <p className="text-sm text-slate-600">Posicione a câmera e clique em "Capturar"</p>
            </div>
            
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={photoVideoRef}
                className="w-full max-h-96 object-cover"
                autoPlay
                muted
                playsInline
              />
            </div>
            
            <div className="flex justify-center gap-4 mt-4">
              <button
                onClick={capturePhoto}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Camera className="w-4 h-4 mr-2" />
                Capturar
              </button>
              <button
                onClick={cancelPhotoCapture}
                className="px-6 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video Preview for Recording */}
      {videoRecording && (
        <div className="bg-black rounded-lg p-4">
          <video
            ref={videoRef}
            className="w-full max-w-md mx-auto rounded"
            muted
          />
          <div className="text-center mt-2">
            <span className="text-red-500 font-medium">
              Gravando: {formatTime(recordingTime)}/15s
            </span>
          </div>
        </div>
      )}

      {/* Media Gallery */}
      {existingMedia.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-slate-900 flex items-center gap-2">
            <Image className="w-5 h-5" />
            Mídias Anexadas ({existingMedia.length})
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {existingMedia.map((media) => (
              <div key={media.id} className="relative bg-slate-50 rounded-lg p-3 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    {getMediaIcon(media.media_type)}
                    <span className="text-xs font-medium">{media.media_type.toUpperCase()}</span>
                  </div>
                  {onMediaDeleted && (
                    <button
                      onClick={() => deleteMedia(media.id!)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {media.media_type === 'image' && (
                  <img
                    src={media.file_url}
                    alt={media.file_name}
                    className="w-full h-24 object-cover rounded"
                  />
                )}
                
                {media.media_type === 'video' && (
                  <video
                    src={media.file_url}
                    className="w-full h-24 object-cover rounded"
                    controls
                  />
                )}
                
                {media.media_type === 'audio' && (
                  <div className="h-24 flex items-center justify-center">
                    <audio
                      src={media.file_url}
                      controls
                      className="w-full"
                    />
                  </div>
                )}
                
                {media.media_type === 'document' && (
                  <div className="h-24 flex items-center justify-center bg-slate-100 rounded">
                    <FileText className="w-8 h-8 text-slate-400" />
                  </div>
                )}
                
                <p className="text-xs text-slate-600 mt-2 truncate" title={media.file_name}>
                  {media.file_name}
                </p>
                {media.file_size && (
                  <p className="text-xs text-slate-500">
                    {(media.file_size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
