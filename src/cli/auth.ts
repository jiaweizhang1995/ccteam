export async function auth(action: string, provider?: string): Promise<void> {
  console.log(`auth ${action}${provider ? ` ${provider}` : ''} — not yet implemented`);
}
