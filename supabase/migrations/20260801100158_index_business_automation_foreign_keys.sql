CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON public.appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_resource_id ON public.appointments(resource_id);
CREATE INDEX IF NOT EXISTS idx_business_opportunities_contact_id ON public.business_opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_business_opportunities_service_id ON public.business_opportunities(service_id);
CREATE INDEX IF NOT EXISTS idx_business_opportunities_resource_id ON public.business_opportunities(resource_id);
CREATE INDEX IF NOT EXISTS idx_business_opportunities_appointment_id ON public.business_opportunities(appointment_id);
CREATE INDEX IF NOT EXISTS idx_business_opportunities_converted_appointment_id ON public.business_opportunities(converted_appointment_id);
CREATE INDEX IF NOT EXISTS idx_business_resource_services_service_id ON public.business_resource_services(service_id);
