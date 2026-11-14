import { useRef, useState, type ComponentRef } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSupabase } from '@/supabase';
import { usePalette } from '@/theme';
import appIcon from '../../assets/brand/icon.png';
import { Action, Caption, Pills } from '@/components/UI';
import { typography } from '@/design';

export default function SignIn() {
  const palette = usePalette();
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const pending = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState('login');
  const [notice, setNotice] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  async function signIn() {
    if (pending.current) return;
    if (!email.trim() || !password) { setError('Inserisci email e password.'); return; }
    pending.current = true;
    setLoading(true);
    setError(null); setNotice(null);
    try {
      if (mode === 'signup' && (password.length < 6 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
        setError('Inserisci un’email valida e una password di almeno 6 caratteri.'); return;
      }
      const client = getSupabase();
      const { data, error: authError } = mode === 'signup'
        ? await client.auth.signUp({ email: email.trim(), password })
        : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (!authError && mode === 'signup' && !data.session) setNotice('Controlla la tua email per confermare l’account, poi torna qui e accedi.');
      if (authError) setError(authError.code === 'invalid_credentials'
        ? 'Email o password non corrette.' : 'Accesso non riuscito. Controlla la connessione e riprova.');
    } catch { setError('Accesso non riuscito. Controlla la connessione e riprova.'); }
    finally { pending.current = false; setLoading(false); }
  }
  return <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Image source={appIcon} accessibilityIgnoresInvertColors style={styles.logo} />
        <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>Il tuo prossimo{`\n`}passo avanti.</Text>
        <Text style={[styles.subtitle, { color: palette.secondary }]}>Il tuo allenamento, i tuoi ritmi.{`\n`}Tutti i progressi in un unico posto.</Text>
        <View style={[styles.form, { backgroundColor: palette.surface }]}>
          <Pills items={[{ id: 'login', label: 'Accedi' }, { id: 'signup', label: 'Registrati' }]} value={mode} onChange={(value) => { setMode(value); setError(null); setNotice(null); }} />
          <Text style={[styles.label, { color: palette.text }]}>Email</Text>
          <TextInput accessibilityLabel="Email" placeholder="nome@esempio.it" placeholderTextColor={palette.secondary} selectionColor={palette.accent}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" autoComplete="email"
            value={email} onChangeText={setEmail} returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()}
            onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
            editable={!loading} style={[styles.input, { color: palette.text, borderColor: focused === 'email' ? palette.accent : palette.inputBorder }]} />
          <Text style={[styles.label, { color: palette.text }]}>Password</Text>
          <View style={[styles.password, { borderColor: focused === 'password' ? palette.accent : palette.inputBorder }]}>
          <TextInput ref={passwordInput} accessibilityLabel="Password" placeholder={mode === 'signup' ? 'Almeno 6 caratteri' : 'La tua password'} placeholderTextColor={palette.secondary} selectionColor={palette.accent}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} autoCapitalize="none" autoCorrect={false} secureTextEntry={!showPassword}
            value={password} onChangeText={setPassword} returnKeyType="go" onSubmitEditing={() => void signIn()}
            onFocus={() => setFocused('password')} onBlur={() => setFocused(null)}
            editable={!loading} style={[styles.passwordInput, { color: palette.text }]} />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Nascondi password' : 'Mostra password'} accessibilityState={{ selected: showPassword }}
              onPress={() => setShowPassword(!showPassword)} style={({ pressed }) => ({ width: 44, minHeight: 56, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
              <SymbolView name={showPassword ? 'eye.slash' : 'eye'} tintColor={palette.secondary} style={{ width: 20, height: 20 }} />
            </Pressable>
          </View>
          {error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
          {notice && <Caption>{notice}</Caption>}
          <View style={{ marginTop: 8 }}><Action title={mode === 'signup' ? 'Crea il tuo account' : 'Accedi'} onPress={() => void signIn()} busy={loading} /></View>
        </View>
        <Text style={[styles.note, { color: palette.secondary }]}>Usa lo stesso account della tua web app.{`\n`}Ritroverai i dati già salvati.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 }, container: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingVertical: 32, maxWidth: 520, width: '100%', alignSelf: 'center' },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 24 },
  title: { ...typography.display },
  subtitle: { ...typography.body, marginTop: 16, marginBottom: 32 },
  form: { padding: 24, borderRadius: 24, gap: 8 }, label: { ...typography.caption, fontWeight: '600', marginTop: 8 },
  input: { ...typography.body, padding: 16, borderWidth: 1, borderRadius: 16, minHeight: 56 },
  password: { borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { ...typography.body, flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 16, paddingLeft: 16 },
  error: { ...typography.caption },
  note: { ...typography.caption, textAlign: 'center', marginTop: 24 },
});
