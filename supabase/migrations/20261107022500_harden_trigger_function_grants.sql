-- Revoke direct RPC execute privileges on internal trigger-only SECURITY DEFINER functions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_project_owner() from public, anon, authenticated;
revoke execute on function public.prevent_orphaned_project_owner() from public, anon, authenticated;
revoke execute on function public.touch_parent_project() from public, anon, authenticated;
revoke execute on function public.touch_parent_product() from public, anon, authenticated;

