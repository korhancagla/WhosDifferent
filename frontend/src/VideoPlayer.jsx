import React, { useEffect, useRef, useState } from 'react';
import { Skull, Mic, MicOff, Camera, CameraOff, Volume2, VolumeX, Users, ShieldAlert } from 'lucide-react';

const VideoPlayer = ({ stream, isLocal, userName, role, isDead, voteCount = 0, isHardwareMuted, isHardwareVideoOff, hasMicrophoneAccess = true, hasCameraAccess = true, onToggleMic, onToggleVideo, forceAudioMuted = false, forceVideoBlank = false, children }) => {
  const videoRef = useRef(null);
  const [remoteMuted, setRemoteMuted] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const isModerator = role === 'moderator';
  const micOff = isHardwareMuted || !hasMicrophoneAccess;
  const cameraOff = isHardwareVideoOff || !hasCameraAccess;

  return (
    <div className={`relative overflow-hidden rounded-xl shadow-lg border aspect-[3/4] sm:aspect-video flex flex-col transition-all duration-700
      ${isDead ? 'border-red-900 bg-red-950/20 grayscale' : (isModerator ? 'border-amber-400 bg-slate-900 shadow-[0_0_28px_rgba(245,158,11,0.22)]' : 'border-slate-700 bg-slate-800')}`}>
      
      {/* Video Container */}
      <div className="relative flex-1 flex items-center justify-center group">
        
        {/* Vote Count Badge */}
        {voteCount > 0 && !isModerator && (
          <div className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg z-20 shadow-[0_0_15px_rgba(220,38,38,0.8)] border-2 border-red-800 animate-pulse">
            {voteCount}
          </div>
        )}

        {/* Local/Remote Controls */}
        {!isDead && (
           <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2.5 z-40 pointer-events-auto">
              {isLocal ? (
                 <>
                   <button
                     onClick={onToggleMic}
                     title={hasMicrophoneAccess ? 'Mikrofonu aç/kapat' : 'Tarayıcıdan mikrofon izni ver'}
                     aria-label={hasMicrophoneAccess ? 'Mikrofonu aç veya kapat' : 'Mikrofon izni gerekiyor'}
                     className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-black/75 backdrop-blur-sm border flex items-center justify-center shadow-lg transition-colors ${micOff ? 'text-red-400 border-red-700' : 'text-slate-100 border-slate-500 hover:bg-black/90'}`}
                   >
                      {micOff ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
                   </button>
                   <button
                     onClick={onToggleVideo}
                     title={hasCameraAccess ? 'Kamerayı aç/kapat' : 'Tarayıcıdan kamera izni ver'}
                     aria-label={hasCameraAccess ? 'Kamerayı aç veya kapat' : 'Kamera izni gerekiyor'}
                     className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-black/75 backdrop-blur-sm border flex items-center justify-center shadow-lg transition-colors ${cameraOff ? 'text-red-400 border-red-700' : 'text-slate-100 border-slate-500 hover:bg-black/90'}`}
                   >
                      {cameraOff ? <CameraOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Camera className="w-5 h-5 sm:w-6 sm:h-6" />}
                   </button>
                 </>
              ) : (
                 <button onClick={() => setRemoteMuted(!remoteMuted)} className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-black/75 backdrop-blur-sm border flex items-center justify-center shadow-lg transition-colors ${remoteMuted ? 'text-red-400 border-red-700' : 'text-slate-100 border-slate-500 hover:bg-black/90'}`}>
                    {remoteMuted ? <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" /> : <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />}
                 </button>
              )}
           </div>
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal || isDead || remoteMuted || forceAudioMuted}
          className={`w-full h-full object-cover transition-all ${isDead ? 'opacity-30' : 'opacity-100'} ${((isLocal && cameraOff) || forceVideoBlank) ? 'opacity-0' : ''}`}
        />
        
        {/* Blind Indicator */}
        {forceVideoBlank && !isDead && !isModerator && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-slate-500 bg-black/90 pointer-events-none">
            <span className="text-4xl mb-2 animate-pulse">😴</span>
            <span className="font-bold tracking-widest uppercase text-xs shadow-black drop-shadow-md">UYUYOR</span>
          </div>
        )}
        
        {/* Dead Overlay */}
        {isDead && role !== 'spectator' && !isModerator && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-red-500">
            <Skull className="w-12 h-12 mb-2 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]" />
            <span className="font-bold tracking-widest uppercase text-lg shadow-black drop-shadow-md">ÖLÜ</span>
          </div>
        )}

        {/* Moderator Badge */}
        {isModerator && (
          <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-black/65 px-3 py-1.5 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.3)] backdrop-blur-sm pointer-events-none">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="text-[11px] font-black uppercase tracking-widest">Moderator</span>
          </div>
        )}
        
        {/* Spectator Overlay */}
        {isDead && role === 'spectator' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 text-sky-500 bg-slate-950/60 backdrop-blur-sm">
            <Users className="w-12 h-12 mb-2 drop-shadow-[0_0_10px_rgba(14,165,233,0.8)]" />
            <span className="font-bold tracking-widest uppercase text-sm text-center shadow-black drop-shadow-md">İZLEYİCİ<br/>(MİSAFİR)</span>
          </div>
        )}

        {/* Overlay details */}
        <div className="absolute top-0 left-0 w-full p-2 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none flex justify-between">
          <span className={`font-semibold text-[15px] px-2 drop-shadow-[0_0_5px_rgba(0,0,0,1)] ${isDead ? 'text-red-400 line-through' : 'text-slate-100'}`}>
            {userName} {isLocal ? "(Sen)" : ""}
          </span>
        </div>
      </div>

      {/* Action Area (Voting Buttons) */}
      {!isDead && children}
    </div>
  );
};

export default VideoPlayer;
