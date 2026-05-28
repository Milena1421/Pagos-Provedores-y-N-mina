declare const Deno: any;
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { record, provider, to } = await req.json();
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Ingenieria 365 <onboarding@resend.dev>';

    if (!RESEND_API_KEY) {
      console.error('CRITICO: No se encontro la variable de entorno RESEND_API_KEY.');
      return new Response(
        JSON.stringify({ error: 'Configuracion incompleta: falta RESEND_API_KEY en los secretos de Supabase.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    const recipients = Array.isArray(to)
      ? to
      : to
          .toString()
          .split(/[;,]/)
          .map((email: string) => email.trim())
          .filter((email: string) => email.length > 5);

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: 'Lista de destinatarios vacia o invalida.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    console.log(`Intentando enviar correo a: ${recipients.join(', ')} para radicado: ${record.radicado}`);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: recipients,
        subject: `Notificacion: ${record.radicado} - ${provider.nombre}`,
        html: `
          <div style="font-family: Inter, sans-serif; padding: 40px; border: 1px solid #e2e8f0; border-radius: 24px; color: #1e293b; max-width: 600px; background-color: #ffffff;">
            <div style="margin-bottom: 30px; text-align: center;">
               <h1 style="color: #2563eb; font-size: 24px; margin: 0; font-weight: 800; letter-spacing: -0.025em;">RADICACION DE PAGO</h1>
               <p style="color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 5px;">Ingenieria 365 - Gestion de Tesoreria</p>
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
                  <td style="padding: 8px 0; color: #64748b; font-weight: 600;">CATEGORIA</td>
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
                  <strong>Descripcion:</strong> ${record.descripcion || 'Sin descripcion adicional.'}
               </p>
            </div>

            <p style="font-size: 11px; color: #94a3b8; margin-top: 40px; text-align: center; font-weight: 500;">
              Este es un correo automatico generado por el sistema de control de pagos. <br/> 
              Favor no responder a esta direccion.
            </p>
          </div>
        `,
      }),
    });

    const resData = await res.json();

    if (!res.ok) {
      console.error('Error devuelto por Resend API:', resData);
      const resendMessage = typeof resData?.message === 'string' ? resData.message : resData?.error || 'No se pudo enviar el correo.';

      return new Response(JSON.stringify({ error: resendMessage, details: resData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: res.status,
      });
    }

    return new Response(JSON.stringify({ success: true, resendId: resData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Error fatal en Edge Function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
