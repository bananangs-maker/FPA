# 공개 시세 출처 · FPA 1.7.0

구현 및 연결 확인: 2026-11-16 한국 시간. 현재 값은 앱 실행 시 원자료에서 가져오며 배포물에 가격을 고정해 넣지 않습니다.

| 항목 | 원자료 및 조회 경로 | 계산·표시 |
| --- | --- | --- |
| USD, EUR, JPY, CNY, MYR, HUF | [ECB 기준환율 안내](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html), [90일 XML](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml) | 같은 날짜 원/EUR ÷ 해당 통화/EUR. EUR 분모는 1, JPY는 100배 표시 |
| WTI 현물 | EIA 원천, [FRED DCOILWTICO](https://fred.stlouisfed.org/series/DCOILWTICO) | USD/bbl, 최근 유효 관측값 |
| Brent 현물 | EIA 원천, [FRED DCOILBRENTEU](https://fred.stlouisfed.org/series/DCOILBRENTEU) | USD/bbl, 최근 유효 관측값 |

ECB는 통상 영업일 약 16:00 CET에 기준환율을 갱신하며 거래 실행용 환율로 사용하지 않도록 안내합니다. 휴일에는 공표값이 없을 수 있습니다. 환율과 유가는 일별 관측·공표 자료이며 장중 실시간 시세가 아닙니다. 최근 날짜와 조회 시각을 따로 표시합니다.

등락률은 같은 시계열의 직전 유효 관측값 대비 `(최근값 / 직전값 − 1) × 100`입니다. 공휴일·결측일을 건너뛰므로 ‘직전 관측일’은 전날과 다를 수 있습니다. 수신 실패 시 등락을 새로 만들지 않습니다.

EIA·FRED의 현재 WTI·Brent 시계열은 공공영역·출처 표기 요청으로 안내되어 있으며 출처·공표일과 원문 링크를 표시합니다. [EIA 저작물 재사용 안내](https://www.eia.gov/about/copyrights_reuse.php). EIA 사이트 전체의 제3자 라이선스 자료까지 자유롭게 재사용할 수 있다는 뜻은 아닙니다.

FRED 페이지는 API 응답이 아니라 최근 관측 표의 HTML을 사용합니다. 다른 시계열이나 원문 형식을 잘못 읽지 않도록 시계열 코드·날짜·관측 표 구조·숫자 유효성을 확인합니다. 표 구조가 바뀌면 이전 값을 유지하거나 조회 불가로 처리합니다. 해당 장애는 `GET /api/market`의 warnings와 화면에 표시됩니다.

공개 고정 URL 세 곳만 서버에서 읽습니다. 시세 API의 요청 쿼리·본문은 허용하지 않으며 제품명·금액·채팅·시나리오를 외부 제공자에게 전달하지 않습니다. 시세 조회에는 추가 인증키가 필요하지 않습니다.
