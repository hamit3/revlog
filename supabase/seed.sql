-- Development seed data for RevLog
-- Demo accounts (password for all three: Password1234):
--   owner@revlog.local  (Owner)
--   member@revlog.local (Member)
--   viewer@revlog.local (Viewer)

do $$
declare
  v_owner_id uuid := '11111111-1111-4111-8111-111111111111';
  v_member_id uuid := '22222222-2222-4222-8222-222222222222';
  v_viewer_id uuid := '33333333-3333-4333-8333-333333333333';
  v_project_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_product_sensor uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
  v_product_gateway uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
  v_cat_hw uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
  v_cat_fw uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
  v_cat_enc uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
  v_cat_test uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4';
  v_cat_prod uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5';
  v_cat_gw_bin uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6';
  v_item_bom uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  v_item_fw uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  v_item_repo uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
  v_item_gw_img uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4';
  v_release_id uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
  v_gw_release_id uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
  v_project_release_id uuid := 'ffffffff-ffff-4fff-8fff-fffffffffff1';
  v_password_hash text;
begin
  v_password_hash := extensions.crypt('Password1234', extensions.gen_salt('bf'));

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values
    (
      v_owner_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'owner@revlog.local',
      v_password_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Elena Rostova"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      v_member_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'member@revlog.local',
      v_password_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Marcus Chen"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      v_viewer_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'viewer@revlog.local',
      v_password_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Sora Takahashi"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
  on conflict (id) do nothing;

  if to_regclass('auth.identities') is not null then
    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values
      (
        v_owner_id,
        v_owner_id,
        v_owner_id::text,
        jsonb_build_object('sub', v_owner_id::text, 'email', 'owner@revlog.local'),
        'email',
        now(),
        now(),
        now()
      ),
      (
        v_member_id,
        v_member_id,
        v_member_id::text,
        jsonb_build_object('sub', v_member_id::text, 'email', 'member@revlog.local'),
        'email',
        now(),
        now(),
        now()
      ),
      (
        v_viewer_id,
        v_viewer_id,
        v_viewer_id::text,
        jsonb_build_object('sub', v_viewer_id::text, 'email', 'viewer@revlog.local'),
        'email',
        now(),
        now(),
        now()
      )
    on conflict do nothing;
  end if;

  insert into public.projects (id, name, description, created_by)
  values (
    v_project_id,
    'Industrial Telemetry Platform',
    'Multi-product field sensing and gateway hardware-software release ledger',
    v_owner_id
  )
  on conflict (id) do nothing;

  insert into public.project_members (project_id, user_id, role)
  values
    (v_project_id, v_member_id, 'member'),
    (v_project_id, v_viewer_id, 'viewer')
  on conflict (project_id, user_id) do nothing;

  insert into public.products (id, project_id, name, code, product_type, description, position, created_by)
  values
    (
      v_product_sensor,
      v_project_id,
      'Sensor Board',
      'PCB-SNS-01',
      'mixed',
      'Industrial RS-485 temperature and humidity telemetry module',
      0,
      v_owner_id
    ),
    (
      v_product_gateway,
      v_project_id,
      'Gateway Controller',
      'SW-GW-01',
      'software',
      'Linux edge collector daemon and Modbus protocol bridge',
      1,
      v_owner_id
    )
  on conflict (id) do nothing;

  insert into public.categories (id, project_id, product_id, name, description, position)
  values
    (v_cat_hw, v_project_id, v_product_sensor, 'Hardware', 'Schematics, PCB layout, BOM and fabrication files', 0),
    (v_cat_fw, v_project_id, v_product_sensor, 'Firmware', 'Embedded firmware binaries and release artifacts', 1),
    (v_cat_enc, v_project_id, v_product_sensor, 'Enclosure', 'Mechanical CAD, STEP files and drawings', 2),
    (v_cat_test, v_project_id, v_product_sensor, 'Test', 'Verification procedures and test reports', 3),
    (v_cat_prod, v_project_id, v_product_sensor, 'Production', 'Pick-and-place, assembly notes and manufacturing packs', 4),
    (v_cat_gw_bin, v_project_id, v_product_gateway, 'Binaries & Builds', 'Compiled gateway packages and checksums', 0)
  on conflict (id) do nothing;

  insert into public.items (
    id,
    project_id,
    product_id,
    category_id,
    title,
    kind,
    version_label,
    note,
    url,
    storage_path,
    file_name,
    file_size,
    sha256,
    created_by
  )
  values
    (
      v_item_bom,
      v_project_id,
      v_product_sensor,
      v_cat_hw,
      'Production BOM',
      'file',
      'Rev B',
      'Validated against JLCPCB stock list',
      null,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/10000000-0000-4000-8000-000000000001/sensor-board-bom-rev-b.csv',
      'sensor-board-bom-rev-b.csv',
      14820,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      v_owner_id
    ),
    (
      v_item_fw,
      v_project_id,
      v_product_sensor,
      v_cat_fw,
      'STM32G0 Application Binary',
      'file',
      'v1.2.0',
      'Signed release build with watchdog enabled',
      null,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/10000000-0000-4000-8000-000000000002/sensor-board-fw-v1.2.0.bin',
      'sensor-board-fw-v1.2.0.bin',
      65536,
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      v_member_id
    ),
    (
      v_item_repo,
      v_project_id,
      v_product_sensor,
      v_cat_test,
      'Thermal Chamber Qualification Log',
      'link',
      'Rev B',
      'External lab report link',
      'https://example.com/reports/sensor-board-rev-b-thermal',
      null,
      null,
      null,
      null,
      v_member_id
    ),
    (
      v_item_gw_img,
      v_project_id,
      v_product_gateway,
      v_cat_gw_bin,
      'Gateway Collector Package',
      'file',
      'v1.0.0',
      'ARM64 Debian package',
      null,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/10000000-0000-4000-8000-000000000003/gateway-collector_1.0.0_arm64.deb',
      'gateway-collector_1.0.0_arm64.deb',
      131072,
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      v_owner_id
    )
  on conflict (id) do nothing;

  insert into public.releases (id, project_id, product_id, version_label, notes, status)
  values
    (
      v_release_id,
      v_project_id,
      v_product_sensor,
      'Rev B',
      'Initial pilot run release package for 50-unit validation batch.',
      'draft'
    ),
    (
      v_gw_release_id,
      v_project_id,
      v_product_gateway,
      'v1.0.0',
      'Initial production gateway package.',
      'draft'
    )
  on conflict (id) do nothing;

  insert into public.release_items (release_id, item_id)
  values
    (v_release_id, v_item_bom),
    (v_release_id, v_item_fw),
    (v_release_id, v_item_repo),
    (v_gw_release_id, v_item_gw_img)
  on conflict (release_id, item_id) do nothing;

  -- Simulate authenticated owner session to publish product releases and upper project release
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text,
    true
  );
  perform public.publish_release(v_release_id);
  perform public.publish_release(v_gw_release_id);

  insert into public.project_releases (id, project_id, version_label, notes, status)
  values (
    v_project_release_id,
    v_project_id,
    'System 2026.11',
    'Complete field deployment baseline bundling Sensor Board Rev B and Gateway Controller v1.0.0.',
    'draft'
  )
  on conflict (id) do nothing;

  insert into public.project_release_products (project_release_id, product_id, release_id)
  values
    (v_project_release_id, v_product_sensor, v_release_id),
    (v_project_release_id, v_product_gateway, v_gw_release_id)
  on conflict (project_release_id, product_id) do nothing;

  perform public.publish_project_release(v_project_release_id);
end;
$$;
