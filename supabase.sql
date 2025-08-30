create extension if not exists pgcrypto;

create table if not exists shops(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  open_hours text,
  created_at timestamp default now()
);

create table if not exists offers(
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops(id) on delete cascade,
  title text not null,
  price integer not null,
  qty_available integer not null,
  pickup_start timestamp not null,
  pickup_end timestamp not null,
  status text default 'active',
  created_at timestamp default now()
);

create table if not exists reservations(
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references offers(id) on delete cascade,
  user_liff_id text not null,
  qty integer default 1,
  status text default 'reserved',
  pickup_code text not null,
  reserved_at timestamp default now(),
  picked_up_at timestamp
);

create table if not exists favorites(
  user_liff_id text not null,
  shop_id uuid not null references shops(id) on delete cascade,
  created_at timestamp default now(),
  primary key (user_liff_id, shop_id)
);
