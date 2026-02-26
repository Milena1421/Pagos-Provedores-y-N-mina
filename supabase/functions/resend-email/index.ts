
declare const Deno: any;
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejar el preflight de CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { record, provider, to } = await req.json()
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

    // Diagnóstico proactivo de la API KEY
    if (!RESEND_API_KEY) {
      console.error("CRÍTICO: No se encontró la variable de entorno RESEND_API_KEY.");
      return new Response(
        JSON.stringify({ error: 'Configuración incompleta: falta RESEND_API_KEY en los secretos de Supabase.' }), 
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      )
    }

    // Limpiar destinatarios (por si vienen con separadores extraños)
    const recipients = Array.isArray(to) 
      ? to 
      : to.toString().split(/[;,]/).map((e: string) => e.trim()).filter((e: string) => e.length > 5);

    if (recipients.length === 0) {
       return new Response(JSON.stringify({ error: 'Lista de destinatarios vacía o inválida.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    console.log(`Intentando enviar correo a: ${recipients.join(', ')} para radicado: ${record.radicado}`);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Ingeniería 365 <onboarding@resend.dev>',
        to: recipients,
        subject: `⚠️ NOTIFICACIÓN: ${record.radicado} - ${provider.nombre}`,
        html: `
          <div style="font-family: 'Inter', sans-serif; padding: 40px; border: 1px solid #e2e8f0; border-radius: 24px; color: #1e293b; max-width: 600px; background-color: #ffffff;">
            <div style="margin-bottom: 30px; text-align: center;">
               <h1 style="color: #2563eb; font-size: 24px; margin: 0; font-weight: 800; letter-spacing: -0.025em;">RADICACIÓN DE PAGO</h1>
               <p style="color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 5px;">Ingeniería 365 • Gestión de Tesorería</p>
            </div>
            
            <div style="background: #f8fafc; padding: 30px; border-radius: 20px; margin: 20px 0; border: 1px solid #f1f5f9;">
              <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">RADICADO</td>
                  <td style="padding: 8px 0; color: #2563eb; font-weight: 800; text-align: right;">${record.radicado}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">BENEFICIARIO</td>
                  <td style="padding: 8px 0; color: #1e293b; font-weight: 700; text-align: right;">${provider.nombre}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">VALOR TOTAL</td>
                  <td style="padding: 8px 0; color: #1e293b; font-weight: 800; text-align: right; font-size: 18px;">$${record.valor.toLocaleString()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">CATEGORÍA</td>
                  <td style="padding: 8px 0; color: #1e293b; font-weight: 700; text-align: right;">${record.categoria}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">ESTADO</td>
                  <td style="padding: 8px 0; color: #1e293b; font-weight: 700; text-align: right; text-transform: uppercase;">${record.estado}</td>
                </tr>
              </table>
            </div>

            <div style="margin-top: 30px; padding: 20px; background: #eff6ff; border-radius: 15px;">
               <p style="margin: 0; font-size: 13px; color: #1d4ed8; font-weight: 500; line-height: 1.6;">
                  <strong>Descripción:</strong> ${record.descripcion || 'Sin descripción adicional.'}
               </p>
            </div>

            <p style="font-size: 11px; color: #94a3b8; margin-top: 40px; text-align: center; font-weight: 500;">
              Este es un correo automático generado por el sistema de control de pagos. <br/> 
              Favor no responder a esta dirección.
            </p>
          </div>
        `,
      }),
    })

    const resData = await res.json()
    
    if (!res.ok) {
      console.error("Error devuelto por Resend API:", resData);
      return new Response(JSON.stringify(resData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: res.status,
      })
    }

    return new Response(JSON.stringify({ success: true, resendId: resData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error("Error fatal en Edge Function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
