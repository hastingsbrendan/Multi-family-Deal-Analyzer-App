


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."deals_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;


ALTER FUNCTION "public"."deals_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;


ALTER FUNCTION "public"."find_user_id_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."group_member_count"("gid" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select count(*)::integer from public.group_members gm where gm.group_id = gid
$$;


ALTER FUNCTION "public"."group_member_count"("gid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."group_members_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if auth.uid() is null then return new; end if;
  if new.group_id <> old.group_id or new.user_id <> old.user_id then
    raise exception 'group membership cannot be moved' using errcode = '42501';
  end if;
  if coalesce(public.my_group_role(old.group_id), '') = 'Owner' then return new; end if;
  if new.role <> old.role
     or new.invited_by is distinct from old.invited_by
     or not (new.status = old.status
             or (old.user_id = auth.uid() and old.status = 'pending' and new.status = 'active')) then
    raise exception 'only a group Owner can change this membership' using errcode = '42501';
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."group_members_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    INSERT INTO public.group_members (group_id, user_id, role, status, invited_by)
    SELECT gip.group_id, NEW.id, gip.role, 'pending', gip.invited_by
    FROM public.group_invites_pending gip
    WHERE lower(gip.invited_email) = lower(NEW.email)
    ON CONFLICT (group_id, user_id) DO NOTHING;

    DELETE FROM public.group_invites_pending
    WHERE lower(invited_email) = lower(NEW.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: group invite conversion skipped for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_group_ids"("include_pending" boolean DEFAULT false) RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select gm.group_id from public.group_members gm
  where gm.user_id = auth.uid() and (include_pending or gm.status = 'active')
$$;


ALTER FUNCTION "public"."my_group_ids"("include_pending" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_group_role"("gid" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select gm.role from public.group_members gm
  where gm.group_id = gid and gm.user_id = auth.uid() and gm.status = 'active'
$$;


ALTER FUNCTION "public"."my_group_role"("gid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_account_deletion"("p_uid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email text;
  g record;
  v_successor uuid;
  v_handed int := 0;
  v_deleted int := 0;
  v_refs int := 0;
  v_feedback int := 0;
begin
  if p_uid is null then
    raise exception 'p_uid is required' using errcode = '22023';
  end if;
  select email into v_email from auth.users where id = p_uid;

  for g in
    select m.group_id from public.group_members m
    where m.user_id = p_uid and m.role = 'Owner' and m.status = 'active'
  loop
    select m.user_id into v_successor
    from public.group_members m
    where m.group_id = g.group_id and m.user_id <> p_uid and m.status = 'active'
    order by m.created_at asc, m.id asc
    limit 1;

    if v_successor is not null then
      update public.group_members set role = 'Owner'
        where group_id = g.group_id and user_id = v_successor;
      update public.groups set created_by = v_successor where id = g.group_id;
      v_handed := v_handed + 1;
    else
      delete from public.groups where id = g.group_id;
      v_deleted := v_deleted + 1;
    end if;
  end loop;

  delete from public.group_deal_refs where owner_user_id = p_uid;
  get diagnostics v_refs = row_count;

  if v_email is not null then
    delete from public.feedback where lower(email) = lower(v_email);
    get diagnostics v_feedback = row_count;
  end if;

  return jsonb_build_object('groups_handed_over', v_handed, 'groups_deleted', v_deleted,
                            'deal_links_removed', v_refs, 'feedback_deleted', v_feedback);
end
$$;


ALTER FUNCTION "public"."prepare_account_deletion"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_shared_deal"("p_deal_id" "uuid", "p_deal_data" "jsonb", "p_expected" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_version timestamptz;
  v_theirs jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_deal_data is null or jsonb_typeof(p_deal_data) <> 'object' then
    raise exception 'deal_data must be a JSON object' using errcode = '22023';
  end if;

  select d.user_id into v_owner from public.deals d where d.deal_id = p_deal_id;
  if v_owner is null then
    return jsonb_build_object('status', 'conflict', 'theirs', null, 'version', null);
  end if;

  if v_owner <> v_uid and not exists (
    select 1
    from public.group_deal_refs r
    join public.group_members m on m.group_id = r.group_id
    where r.deal_id = p_deal_id
      and m.user_id = v_uid
      and m.status = 'active'
      and m.role in ('Owner', 'Editor')
  ) then
    raise exception 'not allowed to edit this deal' using errcode = '42501';
  end if;

  update public.deals
     set deal_data = p_deal_data, updated_at = clock_timestamp()
   where deal_id = p_deal_id and updated_at = p_expected
  returning updated_at into v_version;
  if found then
    return jsonb_build_object('status', 'saved', 'version', v_version);
  end if;

  select d.deal_data, d.updated_at into v_theirs, v_version from public.deals d where d.deal_id = p_deal_id;
  return jsonb_build_object('status', 'conflict', 'theirs', v_theirs, 'version', v_version);
end
$$;


ALTER FUNCTION "public"."save_shared_deal"("p_deal_id" "uuid", "p_deal_data" "jsonb", "p_expected" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."use_api_allowance"("p_kind" "text", "p_limit" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_used integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_kind is null or length(p_kind) > 40 or p_limit is null or p_limit < 1 then
    raise exception 'bad arguments' using errcode = '22023';
  end if;

  insert into public.api_usage as u (user_id, kind, day, count)
  values (v_uid, p_kind, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, kind, day)
  do update set count = u.count + 1
    where u.count < p_limit          -- stop counting once the limit is reached
  returning count into v_used;

  if v_used is null then             -- already at the limit: report over it
    return p_limit + 1;
  end if;
  return v_used;
end
$$;


ALTER FUNCTION "public"."use_api_allowance"("p_kind" "text", "p_limit" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."api_usage" (
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "day" "date" DEFAULT (("now"() AT TIME ZONE 'utc'::"text"))::"date" NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."api_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."blog_subscribers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "subscribed_at" timestamp with time zone,
    "source" "text"
);


ALTER TABLE "public"."blog_subscribers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "prefs" "jsonb",
    "deal_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_data" "jsonb"
);


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "name" "text",
    "category" "text",
    "message" "text" NOT NULL,
    "url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "group_comments_body_check" CHECK ((("char_length"("body") > 0) AND ("char_length"("body") <= 2000)))
);


ALTER TABLE "public"."group_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_deal_refs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "shared_by" "uuid" NOT NULL,
    "shared_at" timestamp with time zone DEFAULT "now"(),
    "sort_order" integer DEFAULT 0
);


ALTER TABLE "public"."group_deal_refs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_invites_pending" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "invited_email" "text" NOT NULL,
    "role" "text" DEFAULT 'Viewer'::"text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "group_invites_pending_role_check" CHECK (("role" = ANY (ARRAY['Editor'::"text", 'Viewer'::"text"])))
);


ALTER TABLE "public"."group_invites_pending" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'Viewer'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "group_members_role_check" CHECK (("role" = ANY (ARRAY['Owner'::"text", 'Editor'::"text", 'Viewer'::"text"]))),
    CONSTRAINT "group_members_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text"])))
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "display_name" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_stats" AS
 SELECT "count"(*) AS "total_users"
   FROM "auth"."users"
  WHERE ("email_confirmed_at" IS NOT NULL);


ALTER VIEW "public"."user_stats" OWNER TO "postgres";


ALTER TABLE ONLY "public"."api_usage"
    ADD CONSTRAINT "api_usage_pkey" PRIMARY KEY ("user_id", "kind", "day");



ALTER TABLE ONLY "public"."blog_subscribers"
    ADD CONSTRAINT "blog_subscribers_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."blog_subscribers"
    ADD CONSTRAINT "blog_subscribers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("deal_id");



ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_comments"
    ADD CONSTRAINT "group_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_deal_refs"
    ADD CONSTRAINT "group_deal_refs_group_id_deal_id_key" UNIQUE ("group_id", "deal_id");



ALTER TABLE ONLY "public"."group_deal_refs"
    ADD CONSTRAINT "group_deal_refs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_invites_pending"
    ADD CONSTRAINT "group_invites_pending_group_id_invited_email_key" UNIQUE ("group_id", "invited_email");



ALTER TABLE ONLY "public"."group_invites_pending"
    ADD CONSTRAINT "group_invites_pending_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_user_id_key" UNIQUE ("group_id", "user_id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_group_comments_deal" ON "public"."group_comments" USING "btree" ("group_id", "deal_id");



CREATE OR REPLACE TRIGGER "deals_touch_updated_at" BEFORE INSERT OR UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."deals_touch_updated_at"();



CREATE OR REPLACE TRIGGER "group_members_guard" BEFORE UPDATE ON "public"."group_members" FOR EACH ROW EXECUTE FUNCTION "public"."group_members_guard"();



ALTER TABLE ONLY "public"."api_usage"
    ADD CONSTRAINT "api_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_comments"
    ADD CONSTRAINT "group_comments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_comments"
    ADD CONSTRAINT "group_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_deal_refs"
    ADD CONSTRAINT "group_deal_refs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invites_pending"
    ADD CONSTRAINT "group_invites_pending_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_invites_pending"
    ADD CONSTRAINT "group_invites_pending_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Authors and owners can delete comments" ON "public"."group_comments" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."group_members" "gm"
  WHERE (("gm"."group_id" = "group_comments"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = 'Owner'::"text") AND ("gm"."status" = 'active'::"text"))))));



CREATE POLICY "Authors can edit own comments" ON "public"."group_comments" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("group_id" IN ( SELECT "gm"."group_id"
   FROM "public"."group_members" "gm"
  WHERE (("gm"."user_id" = "auth"."uid"()) AND ("gm"."status" = 'active'::"text"))))));



CREATE POLICY "Editors can manage refs" ON "public"."group_deal_refs" FOR INSERT WITH CHECK (("group_id" IN ( SELECT "group_members"."group_id"
   FROM "public"."group_members"
  WHERE (("group_members"."user_id" = "auth"."uid"()) AND ("group_members"."status" = 'active'::"text") AND ("group_members"."role" = ANY (ARRAY['Owner'::"text", 'Editor'::"text"]))))));



CREATE POLICY "Group members can post comments" ON "public"."group_comments" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("group_id" IN ( SELECT "group_members"."group_id"
   FROM "public"."group_members"
  WHERE (("group_members"."user_id" = "auth"."uid"()) AND ("group_members"."status" = 'active'::"text"))))));



CREATE POLICY "Group members can read comments" ON "public"."group_comments" FOR SELECT USING (("group_id" IN ( SELECT "group_members"."group_id"
   FROM "public"."group_members"
  WHERE (("group_members"."user_id" = "auth"."uid"()) AND ("group_members"."status" = 'active'::"text")))));



CREATE POLICY "Group members can read refs" ON "public"."group_deal_refs" FOR SELECT USING (("group_id" IN ( SELECT "group_members"."group_id"
   FROM "public"."group_members"
  WHERE (("group_members"."user_id" = "auth"."uid"()) AND ("group_members"."status" = 'active'::"text")))));



CREATE POLICY "Group members can read shared deals" ON "public"."deals" FOR SELECT USING (("deal_id" IN ( SELECT "gdr"."deal_id"
   FROM ("public"."group_deal_refs" "gdr"
     JOIN "public"."group_members" "gm" ON (("gm"."group_id" = "gdr"."group_id")))
  WHERE (("gm"."user_id" = "auth"."uid"()) AND ("gm"."status" = 'active'::"text")))));



CREATE POLICY "Owners and editors can share deals" ON "public"."group_deal_refs" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."group_members" "gm"
  WHERE (("gm"."group_id" = "group_deal_refs"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = ANY (ARRAY['Owner'::"text", 'Editor'::"text"])) AND ("gm"."status" = 'active'::"text")))));



CREATE POLICY "Owners can delete refs" ON "public"."group_deal_refs" FOR DELETE USING ((("owner_user_id" = "auth"."uid"()) OR ("group_id" IN ( SELECT "group_members"."group_id"
   FROM "public"."group_members"
  WHERE (("group_members"."user_id" = "auth"."uid"()) AND ("group_members"."role" = 'Owner'::"text") AND ("group_members"."status" = 'active'::"text"))))));



CREATE POLICY "Owners can update refs" ON "public"."group_deal_refs" FOR UPDATE USING (("group_id" IN ( SELECT "group_members"."group_id"
   FROM "public"."group_members"
  WHERE (("group_members"."user_id" = "auth"."uid"()) AND ("group_members"."status" = 'active'::"text") AND ("group_members"."role" = ANY (ARRAY['Owner'::"text", 'Editor'::"text"]))))));



CREATE POLICY "Sharer or owner can remove deal from group" ON "public"."group_deal_refs" FOR DELETE USING ((("shared_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."group_members" "gm"
  WHERE (("gm"."group_id" = "group_deal_refs"."group_id") AND ("gm"."user_id" = "auth"."uid"()) AND ("gm"."role" = 'Owner'::"text") AND ("gm"."status" = 'active'::"text"))))));



CREATE POLICY "Users can delete own comments" ON "public"."group_comments" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR ("group_id" IN ( SELECT "group_members"."group_id"
   FROM "public"."group_members"
  WHERE (("group_members"."user_id" = "auth"."uid"()) AND ("group_members"."role" = 'Owner'::"text") AND ("group_members"."status" = 'active'::"text"))))));



CREATE POLICY "Users can delete own deals" ON "public"."deals" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own deals" ON "public"."deals" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own deals" ON "public"."deals" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update own deals" ON "public"."deals" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."api_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."blog_subscribers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_deal_refs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_invites_pending" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups_delete_owner" ON "public"."groups" FOR DELETE TO "authenticated" USING (("public"."my_group_role"("id") = 'Owner'::"text"));



CREATE POLICY "groups_insert_own" ON "public"."groups" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "groups_select_members" ON "public"."groups" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR ("id" IN ( SELECT "public"."my_group_ids"(true) AS "my_group_ids"))));



CREATE POLICY "groups_update_owner" ON "public"."groups" FOR UPDATE TO "authenticated" USING (("public"."my_group_role"("id") = 'Owner'::"text")) WITH CHECK (("public"."my_group_role"("id") = 'Owner'::"text"));



CREATE POLICY "insert_own" ON "public"."blog_subscribers" FOR INSERT WITH CHECK (true);



CREATE POLICY "invites_delete" ON "public"."group_invites_pending" FOR DELETE TO "authenticated" USING ((("invited_by" = "auth"."uid"()) OR ("public"."my_group_role"("group_id") = 'Owner'::"text")));



CREATE POLICY "invites_insert" ON "public"."group_invites_pending" FOR INSERT TO "authenticated" WITH CHECK ((("invited_by" = "auth"."uid"()) AND ("public"."my_group_role"("group_id") = ANY (ARRAY['Owner'::"text", 'Editor'::"text"]))));



CREATE POLICY "invites_select" ON "public"."group_invites_pending" FOR SELECT TO "authenticated" USING ((("invited_by" = "auth"."uid"()) OR ("public"."my_group_role"("group_id") = 'Owner'::"text")));



CREATE POLICY "members_delete" ON "public"."group_members" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("public"."my_group_role"("group_id") = 'Owner'::"text")));



CREATE POLICY "members_insert" ON "public"."group_members" FOR INSERT TO "authenticated" WITH CHECK (((("user_id" = "auth"."uid"()) AND ("role" = 'Owner'::"text") AND ("status" = 'active'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."groups" "gr"
  WHERE (("gr"."id" = "group_members"."group_id") AND ("gr"."created_by" = "auth"."uid"())))) AND ("public"."group_member_count"("group_id") = 0)) OR (("user_id" <> "auth"."uid"()) AND ("status" = 'pending'::"text") AND ("role" = ANY (ARRAY['Editor'::"text", 'Viewer'::"text"])) AND ("invited_by" = "auth"."uid"()) AND ("public"."my_group_role"("group_id") = ANY (ARRAY['Owner'::"text", 'Editor'::"text"])))));



CREATE POLICY "members_select" ON "public"."group_members" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("group_id" IN ( SELECT "public"."my_group_ids"(false) AS "my_group_ids"))));



CREATE POLICY "members_update" ON "public"."group_members" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("public"."my_group_role"("group_id") = 'Owner'::"text"))) WITH CHECK ((("user_id" = "auth"."uid"()) OR ("public"."my_group_role"("group_id") = 'Owner'::"text")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."group_members" "gm"
  WHERE (("gm"."user_id" = "profiles"."id") AND ("gm"."group_id" IN ( SELECT "public"."my_group_ids"(false) AS "my_group_ids"))))) OR (EXISTS ( SELECT 1
   FROM "public"."group_comments" "c"
  WHERE (("c"."user_id" = "profiles"."id") AND ("c"."group_id" IN ( SELECT "public"."my_group_ids"(false) AS "my_group_ids")))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."deals_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."deals_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deals_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_user_id_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_user_id_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_user_id_by_email"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."group_member_count"("gid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."group_member_count"("gid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."group_member_count"("gid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."group_members_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."group_members_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_group_ids"("include_pending" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_group_ids"("include_pending" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_group_ids"("include_pending" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."my_group_role"("gid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."my_group_role"("gid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_group_role"("gid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_account_deletion"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_account_deletion"("p_uid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_shared_deal"("p_deal_id" "uuid", "p_deal_data" "jsonb", "p_expected" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_shared_deal"("p_deal_id" "uuid", "p_deal_data" "jsonb", "p_expected" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_shared_deal"("p_deal_id" "uuid", "p_deal_data" "jsonb", "p_expected" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."use_api_allowance"("p_kind" "text", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."use_api_allowance"("p_kind" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."use_api_allowance"("p_kind" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."api_usage" TO "service_role";



GRANT ALL ON TABLE "public"."blog_subscribers" TO "anon";
GRANT ALL ON TABLE "public"."blog_subscribers" TO "authenticated";
GRANT ALL ON TABLE "public"."blog_subscribers" TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT ALL ON TABLE "public"."feedback" TO "service_role";



GRANT ALL ON TABLE "public"."group_comments" TO "anon";
GRANT ALL ON TABLE "public"."group_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."group_comments" TO "service_role";



GRANT ALL ON TABLE "public"."group_deal_refs" TO "anon";
GRANT ALL ON TABLE "public"."group_deal_refs" TO "authenticated";
GRANT ALL ON TABLE "public"."group_deal_refs" TO "service_role";



GRANT ALL ON TABLE "public"."group_invites_pending" TO "anon";
GRANT ALL ON TABLE "public"."group_invites_pending" TO "authenticated";
GRANT ALL ON TABLE "public"."group_invites_pending" TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_stats" TO "anon";
GRANT ALL ON TABLE "public"."user_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_stats" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







