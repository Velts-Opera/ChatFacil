CREATE INDEX IF NOT EXISTS idx_appointments_matter_id ON public.appointments(matter_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_channel_id ON public.automation_rules(channel_id);
CREATE INDEX IF NOT EXISTS idx_channels_created_by ON public.channels(created_by);
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON public.companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_intake_id ON public.conflict_checks(intake_id);
CREATE INDEX IF NOT EXISTS idx_conflict_checks_reviewed_by ON public.conflict_checks(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_consents_contact_id ON public.consents(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag_id ON public.contact_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_company_id ON public.conversation_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_user_id ON public.conversation_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON public.conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_document_extractions_document_id ON public.document_extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_conversation_id ON public.email_threads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_conversation_id ON public.handoffs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_intake_id ON public.handoffs(intake_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_resolved_by ON public.handoffs(resolved_by);
CREATE INDEX IF NOT EXISTS idx_intake_fields_source_message_id ON public.intake_fields(source_message_id);
CREATE INDEX IF NOT EXISTS idx_intakes_contact_id ON public.intakes(contact_id);
CREATE INDEX IF NOT EXISTS idx_integration_health_checks_company_id ON public.integration_health_checks(company_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_contact_id ON public.legal_documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_intake_id ON public.legal_documents(intake_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_matter_id ON public.legal_documents(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_parties_intake_id ON public.matter_parties(intake_id);
CREATE INDEX IF NOT EXISTS idx_matter_parties_matter_id ON public.matter_parties(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_timeline_matter_id ON public.matter_timeline(matter_id);
CREATE INDEX IF NOT EXISTS idx_matters_contact_id ON public.matters(contact_id);
CREATE INDEX IF NOT EXISTS idx_matters_intake_id ON public.matters(intake_id);
CREATE INDEX IF NOT EXISTS idx_matters_responsible_lawyer_id ON public.matters(responsible_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_channel_id ON public.outbound_queue(channel_id);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_contact_id ON public.outbound_queue(contact_id);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_conversation_id ON public.outbound_queue(conversation_id);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_created_by ON public.outbound_queue(created_by);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_sent_message_id ON public.outbound_queue(sent_message_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_company_id ON public.quick_replies(company_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company_id ON public.user_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_conversation_id ON public.voice_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_intake_id ON public.voice_calls(intake_id);

DROP POLICY IF EXISTS "own company - select" ON public.companies;
DROP POLICY IF EXISTS "super admin - select companies" ON public.companies;
CREATE POLICY "companies - select own or super admin" ON public.companies
  FOR SELECT TO authenticated
  USING (id = (SELECT public.get_user_company_id()) OR (SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "own company - update" ON public.companies;
DROP POLICY IF EXISTS "super admin - update companies" ON public.companies;
CREATE POLICY "companies - update own or super admin" ON public.companies
  FOR UPDATE TO authenticated
  USING (id = (SELECT public.get_user_company_id()) OR (SELECT public.is_super_admin()))
  WITH CHECK (id = (SELECT public.get_user_company_id()) OR (SELECT public.is_super_admin()));

DROP POLICY IF EXISTS "own profile - select" ON public.profiles;
CREATE POLICY "own profile - select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR company_id = (SELECT public.get_user_company_id()));

DROP POLICY IF EXISTS "platform admins - see self" ON public.platform_admins;
CREATE POLICY "platform admins - see self" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

NOTIFY pgrst, 'reload schema';
