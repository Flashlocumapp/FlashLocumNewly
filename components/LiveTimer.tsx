import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

interface LiveTimerProps {
  startedAt: string | null;
}

export default function LiveTimer({ startedAt }: LiveTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setElapsed(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;

  const elapsedDisplay = formatElapsed(elapsed);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: '#DCFCE7',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginTop: 6,
        gap: 5,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#2DC653' }} />
      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#15803D', letterSpacing: 0.5 }}>
        {elapsedDisplay}
      </Text>
    </View>
  );
}
