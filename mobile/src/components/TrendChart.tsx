import { useMemo, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { usePalette } from '../theme';
import { formatDate } from '../data/exercises';
import { Caption } from './UI';
import { typography } from '../design';

export function TrendChart({ data, label, unit = '', bars = false }: { data: { date: string; value: number }[]; label: string; unit?: string; bars?: boolean }) {
  const p = usePalette();
  const [width, setWidth] = useState(280);
  const [selected, setSelected] = useState<number | null>(null);
  const points = data.slice(-300);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (event) => setSelected(Math.round(Math.max(0, Math.min(1, (event.nativeEvent.locationX - 12) / (width - 24))) * (points.length - 1))),
  }), [points.length, width]);
  if (!points.length) return <Caption>Registra un allenamento per vedere i progressi.</Caption>;
  const index = Math.min(selected ?? points.length - 1, points.length - 1);
  const active = points[index];
  const min = bars ? 0 : Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const x = (i: number) => 12 + (points.length === 1 ? (width - 24) / 2 : i / (points.length - 1) * (width - 24));
  const y = (value: number) => max === min ? (bars ? 145 : 82) : 138 - (value - min) / (max - min) * 110;
  const line = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(point.value)}`).join(' ');
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ gap: 12 }}>
    <View accessibilityLiveRegion="polite"><Text style={{ ...typography.title, color: p.text, fontVariant: ['tabular-nums'] }}>{active.value.toLocaleString('it-IT')}{unit ? ` ${unit}` : ''}</Text>
      <Caption>{label} · {formatDate(active.date)}</Caption></View>
    <View {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: points.length - 1, now: index, text: `${active.value} ${unit}, ${formatDate(active.date)}` }}
      accessibilityActions={[{ name: 'increment', label: 'Valore successivo' }, { name: 'decrement', label: 'Valore precedente' }]}
      onAccessibilityAction={(event) => setSelected(Math.max(0, Math.min(points.length - 1, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
    <Svg width={width} height={160} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      onPress={(event) => setSelected(Math.round(Math.max(0, Math.min(1, (event.nativeEvent.locationX - 12) / (width - 24))) * (points.length - 1)))}>
      <Defs><LinearGradient id="area" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={p.accent} stopOpacity={0.2} /><Stop offset="1" stopColor={p.accent} stopOpacity={0} /></LinearGradient></Defs>
      <Path d={`M12,145 L${width - 12},145`} stroke={p.separator} strokeWidth={1} />
      {bars ? points.map((point, i) => <Rect key={`${point.date}:${i}`} x={x(i) - Math.max(3, width / points.length / 4)} y={y(point.value)}
        width={Math.max(6, width / points.length / 2)} height={point.value === 0 ? 0 : Math.max(2, 145 - y(point.value))} rx={5} fill={p.accent} opacity={index === i ? 1 : 0.4} />)
        : <><Path d={`${line} L${x(points.length - 1)},145 L${x(0)},145 Z`} fill="url(#area)" /><Path d={line} stroke={p.accent} strokeWidth={3} strokeLinecap="round" fill="none" />
          <Circle cx={x(index)} cy={y(active.value)} r={5} fill={p.accent} stroke={p.surface} strokeWidth={2} /></>}
    </Svg></View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Caption>{formatDate(points[0].date)}</Caption><Caption>{formatDate(points.at(-1)!.date)}</Caption></View>
  </View>;
}
