import z from "zod";

export const InspectionSchema = z.object({
  id: z.number().optional(),
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  location: z.string().min(1, "Local é obrigatório"),
  company_name: z.string().min(1, "Nome da empresa é obrigatório"),
  cep: z.string().optional(),
  address: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  inspector_name: z.string().min(1, "Nome do inspetor é obrigatório"),
  inspector_email: z.string().email("Email inválido").optional(),
  responsible_name: z.string().optional(),
  status: z.enum(['pendente', 'em_andamento', 'concluida', 'cancelada']).default('pendente'),
  priority: z.enum(['baixa', 'media', 'alta', 'critica']).default('media'),
  scheduled_date: z.string().optional(),
  completed_date: z.string().optional(),
  action_plan: z.string().optional(),
  action_plan_type: z.enum(['5w2h', 'simple']).default('5w2h'),
  created_at: z.string(),
  updated_at: z.string(),
});

export type InspectionType = z.infer<typeof InspectionSchema>;

export const InspectionItemSchema = z.object({
  id: z.number().optional(),
  inspection_id: z.number(),
  category: z.string().min(1, "Categoria é obrigatória"),
  item_description: z.string().min(1, "Descrição é obrigatória"),
  is_compliant: z.boolean().optional(),
  observations: z.string().optional(),
  photo_url: z.string().optional(),
});

export type InspectionItemType = z.infer<typeof InspectionItemSchema>;

export const InspectionReportSchema = z.object({
  id: z.number().optional(),
  inspection_id: z.number(),
  summary: z.string().optional(),
  recommendations: z.string().optional(),
  risk_level: z.enum(['baixo', 'medio', 'alto', 'critico']).optional(),
  report_url: z.string().optional(),
});

export type InspectionReportType = z.infer<typeof InspectionReportSchema>;

export const InspectionMediaSchema = z.object({
  id: z.number().optional(),
  inspection_id: z.number(),
  inspection_item_id: z.number().optional(),
  media_type: z.enum(['image', 'video', 'audio', 'document']),
  file_name: z.string().min(1, "Nome do arquivo é obrigatório"),
  file_url: z.string().min(1, "URL do arquivo é obrigatória"),
  file_size: z.number().optional(),
  mime_type: z.string().optional(),
  description: z.string().optional(),
});

export type InspectionMediaType = z.infer<typeof InspectionMediaSchema>;

export const AIAnalysisRequestSchema = z.object({
  inspection_id: z.number(),
  media_urls: z.array(z.string()),
  inspection_context: z.string(),
  non_compliant_items: z.array(z.string()),
});

export type AIAnalysisRequest = z.infer<typeof AIAnalysisRequestSchema>;
