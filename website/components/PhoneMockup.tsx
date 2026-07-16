const WORDS = [
  { en: 'Effort', meaning: '努力', dots: 4 },
  { en: 'Wisdom', meaning: '知恵', dots: 3 },
  { en: 'Humble', meaning: '謙虚', dots: 2 },
];

export default function PhoneMockup() {
  return (
    <div
      className="relative mx-auto select-none"
      style={{ width: 256, height: 516 }}
      aria-hidden
    >
      {/* Glow behind phone */}
      <div
        className="absolute -inset-12 -z-10 rounded-full"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 55%, rgba(99,102,241,0.28) 0%, rgba(59,130,246,0.18) 50%, transparent 75%)',
          filter: 'blur(32px)',
        }}
      />

      {/* Phone chassis */}
      <div
        className="relative w-full h-full overflow-visible"
        style={{
          borderRadius: 44,
          background: 'linear-gradient(160deg, #28273d 0%, #18172a 100%)',
          boxShadow:
            '0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* Side buttons */}
        <div className="absolute" style={{ left: -3, top: 100, width: 3, height: 28, borderRadius: '2px 0 0 2px', background: '#3a3a55' }} />
        <div className="absolute" style={{ left: -3, top: 136, width: 3, height: 28, borderRadius: '2px 0 0 2px', background: '#3a3a55' }} />
        <div className="absolute" style={{ right: -3, top: 118, width: 3, height: 44, borderRadius: '0 2px 2px 0', background: '#3a3a55' }} />

        {/* Screen */}
        <div
          className="absolute overflow-hidden"
          style={{
            top: 6,
            left: 6,
            right: 6,
            bottom: 6,
            borderRadius: 38,
            background: '#080816',
          }}
        >
          {/* Status bar / dynamic island */}
          <div className="flex items-center justify-center" style={{ height: 36 }}>
            <div style={{ width: 88, height: 20, borderRadius: 12, background: '#18182a' }} />
          </div>

          {/* App nav bar */}
          <div
            className="flex items-center justify-between"
            style={{ padding: '2px 14px 6px' }}
          >
            <div className="flex items-center" style={{ gap: 6 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: 'linear-gradient(135deg,#3B82F6,#6366F1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 900,
                  color: '#fff',
                  letterSpacing: -0.5,
                }}
              >
                WP
              </div>
              <span style={{ color: '#e8e8ff', fontSize: 12, fontWeight: 700 }}>WordMemo</span>
            </div>
            <span style={{ color: '#4a4a7a', fontSize: 13 }}>⚙</span>
          </div>

          {/* Folder chip */}
          <div style={{ padding: '0 12px 8px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.22)',
                borderRadius: 8,
                padding: '3px 9px',
              }}
            >
              <span style={{ color: '#60a0f0', fontSize: 10, fontWeight: 600 }}>📁  My Words</span>
            </div>
          </div>

          {/* Main flashcard */}
          <div
            style={{
              margin: '0 10px',
              borderRadius: 16,
              background: '#111a3a',
              border: '1px solid rgba(80,110,220,0.25)',
              padding: '13px 14px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ color: '#4060a0', fontSize: 8.5, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>
              ENGLISH
            </div>
            <div style={{ color: '#e8f0ff', fontSize: 21, fontWeight: 800, letterSpacing: -0.5, marginBottom: 8 }}>
              Persevere
            </div>
            <div style={{ height: 1, background: 'rgba(80,110,220,0.2)', marginBottom: 8 }} />
            <div style={{ color: '#4060a0', fontSize: 8.5, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>
              MEANING
            </div>
            <div style={{ color: '#8098c8', fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}>
              続けて頑張る
            </div>
          </div>

          {/* Word list */}
          <div style={{ padding: '8px 10px 0' }}>
            {WORDS.map((w) => (
              <div
                key={w.en}
                style={{
                  background: '#0c0b1e',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.05)',
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 5,
                }}
              >
                <div>
                  <div style={{ color: '#c8d4f0', fontSize: 11, fontWeight: 600 }}>{w.en}</div>
                  <div style={{ color: '#444870', fontSize: 9, marginTop: 1 }}>{w.meaning}</div>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[1, 2, 3, 4].map((d) => (
                    <div
                      key={d}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: d <= w.dots ? '#3B82F6' : 'rgba(59,130,246,0.12)',
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* FAB */}
          <div
            style={{
              position: 'absolute',
              bottom: 28,
              right: 14,
              width: 36,
              height: 36,
              borderRadius: 18,
              background: 'linear-gradient(135deg,#3B82F6,#6366F1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(59,130,246,0.5)',
              fontSize: 20,
              color: '#fff',
              fontWeight: 300,
            }}
          >
            +
          </div>

          {/* Home indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: 7,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 76,
              height: 3,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.18)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
