/*
 * 토스페이먼츠 설정
 *
 * - CLIENT_KEY: 주문서형(결제위젯) 연동 키 중 '클라이언트 키'예요. test_gck_ 또는 live_gck_ 로 시작해요.
 *   아래 값은 토스페이먼츠 문서에 공개된 테스트 키예요. 상점 가입 후 개발자센터 > API 키 메뉴의
 *   본인 키로 바꿔 주세요.
 * - 시크릿 키(test_gsk_ / live_gsk_)는 절대 이 파일이나 브라우저 코드에 넣지 마세요.
 *   결제 승인 API는 반드시 서버에서 시크릿 키로 호출해야 해요.
 */
window.TOSS_CONFIG = {
  CLIENT_KEY: 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm',
  VARIANT_KEY: 'DEFAULT',
  AGREEMENT_VARIANT_KEY: 'AGREEMENT',
};
