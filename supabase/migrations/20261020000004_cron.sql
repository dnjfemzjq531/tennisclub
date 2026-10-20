-- 정기 작업: 매일 00:05(KST) 이번 달 회비 생성, 10분마다 오래된 주문 정리
create extension if not exists pg_cron;

select cron.schedule('generate-monthly-dues', '5 15 * * *', $$ select public.generate_monthly_dues(); $$);
select cron.schedule('expire-stale-orders', '*/10 * * * *', $$ select public.expire_stale_orders(); $$);
