/*
 * Supabase 설정
 *
 * - URL과 publishable 키는 브라우저에 공개돼도 되는 값이에요. 데이터 보호는 RLS가 맡아요.
 * - service_role 키, 토스 시크릿 키는 절대 여기에 넣지 마세요. (Edge Function 시크릿으로만 써요)
 * - DEMO_ACCOUNT는 누구나 둘러볼 수 있게 공개한 데모 계정이에요. 운영에서 숨기려면 null로 바꿔요.
 */
window.SUPABASE_CONFIG = {
  URL: 'https://fnbwfnamydzuorqetbod.supabase.co',
  PUBLISHABLE_KEY: 'sb_publishable_JlRFTL6UaIgJG2U5MGRl6w_NTdgB7J1',
  DEMO_ACCOUNT: { email: 'demo@example.com', password: 'rallyclub-demo-2026' },
};
