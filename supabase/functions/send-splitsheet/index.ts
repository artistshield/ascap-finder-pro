import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Writer {
  fullName: string;
  email: string;
  pro: string;
  ipiNumber: string;
  role: string;
  share: number;
  publisher?: {
    name: string;
    email: string;
    pro: string;
    ipiNumber: string;
    share: number;
  };
}

interface SplitSheetRequest {
  songInfo: {
    title: string;
    artistName: string;
    albumTitle: string;
    releaseDate: string;
    isrcCode: string;
  };
  writers: Writer[];
}

const generateSplitSheetHTML = (songInfo: SplitSheetRequest['songInfo'], writers: Writer[], recipientName: string) => {
  const writersRows = writers.map(w => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #333;">${w.fullName}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333;">${w.role || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333;">${w.pro || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333;">${w.ipiNumber || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333; text-align: right; font-weight: bold;">${w.share.toFixed(2)}%</td>
    </tr>
    ${w.publisher ? `
    <tr style="background: rgba(218, 165, 32, 0.1);">
      <td style="padding: 12px; border-bottom: 1px solid #333; padding-left: 30px;">↳ ${w.publisher.name} (Publisher)</td>
      <td style="padding: 12px; border-bottom: 1px solid #333;">Publisher</td>
      <td style="padding: 12px; border-bottom: 1px solid #333;">${w.publisher.pro || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333;">${w.publisher.ipiNumber || '-'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #333; text-align: right; font-weight: bold; color: #DAA520;">${w.publisher.share.toFixed(2)}%</td>
    </tr>
    ` : ''}
  `).join('');

  const writersTotal = writers.reduce((sum, w) => sum + w.share, 0);
  const publishersTotal = writers.reduce((sum, w) => sum + (w.publisher?.share || 0), 0);
  const grandTotal = writersTotal + publishersTotal;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Split Sheet - ${songInfo.title}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #f5f5f5; margin: 0; padding: 40px;">
      <div style="max-width: 700px; margin: 0 auto; background: #16213e; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%); padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; letter-spacing: 1px;">🎵 Split Sheet</h1>
          <p style="margin: 10px 0 0; opacity: 0.9;">Songwriter Royalty Agreement</p>
        </div>
        
        <!-- Song Info -->
        <div style="padding: 30px; border-bottom: 1px solid #333;">
          <h2 style="margin: 0 0 20px; color: #DAA520; font-size: 24px;">${songInfo.title}</h2>
          <div style="display: grid; gap: 10px;">
            ${songInfo.artistName ? `<p style="margin: 0;"><strong>Artist:</strong> ${songInfo.artistName}</p>` : ''}
            ${songInfo.albumTitle ? `<p style="margin: 0;"><strong>Album/Single:</strong> ${songInfo.albumTitle}</p>` : ''}
            ${songInfo.releaseDate ? `<p style="margin: 0;"><strong>Release Date:</strong> ${songInfo.releaseDate}</p>` : ''}
            ${songInfo.isrcCode ? `<p style="margin: 0;"><strong>ISRC:</strong> ${songInfo.isrcCode}</p>` : ''}
          </div>
        </div>
        
        <!-- Greeting -->
        <div style="padding: 30px 30px 0;">
          <p style="margin: 0;">Dear ${recipientName},</p>
          <p>You are receiving this split sheet for review and signature. Please review the ownership splits below:</p>
        </div>
        
        <!-- Splits Table -->
        <div style="padding: 0 30px 30px;">
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background: #0f3460;">
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #9333ea;">Name</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #9333ea;">Role</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #9333ea;">PRO</th>
                <th style="padding: 12px; text-align: left; border-bottom: 2px solid #9333ea;">IPI</th>
                <th style="padding: 12px; text-align: right; border-bottom: 2px solid #9333ea;">Share</th>
              </tr>
            </thead>
            <tbody>
              ${writersRows}
            </tbody>
            <tfoot>
              <tr style="background: #0f3460;">
                <td colspan="4" style="padding: 12px; font-weight: bold;">Total</td>
                <td style="padding: 12px; text-align: right; font-weight: bold; color: ${Math.abs(grandTotal - 100) < 0.01 ? '#22c55e' : '#ef4444'};">${grandTotal.toFixed(2)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        <!-- Signature Section -->
        <div style="padding: 30px; background: #0f3460; border-top: 1px solid #333;">
          <h3 style="margin: 0 0 15px; color: #DAA520;">Agreement & Signature</h3>
          <p style="margin: 0 0 20px; font-size: 14px; color: #aaa;">
            By signing below, I confirm that the above information is accurate and I agree to the ownership splits as stated.
          </p>
          <div style="border: 2px dashed #9333ea; padding: 30px; text-align: center; border-radius: 8px;">
            <p style="margin: 0; color: #666;">Sign here: ____________________________</p>
            <p style="margin: 10px 0 0; font-size: 12px; color: #666;">Date: ____________________________</p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="padding: 20px; text-align: center; background: #0a0a1a; font-size: 12px; color: #666;">
          <p style="margin: 0;">Sent via Artist Shield Split Sheet</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { songInfo, writers }: SplitSheetRequest = await req.json();
    
    console.log("Sending split sheet for:", songInfo.title);
    console.log("Writers:", writers.length);

    // Collect all recipients
    const recipients: { email: string; name: string }[] = [];
    
    writers.forEach((writer) => {
      if (writer.email) {
        recipients.push({ email: writer.email, name: writer.fullName || 'Writer' });
      }
      if (writer.publisher?.email) {
        recipients.push({ email: writer.publisher.email, name: writer.publisher.name || 'Publisher' });
      }
    });

    console.log("Recipients:", recipients);

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: "No recipients with email addresses found" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send email to each recipient
    const results = await Promise.all(
      recipients.map(async (recipient) => {
        const html = generateSplitSheetHTML(songInfo, writers, recipient.name);
        
        const emailResponse = await resend.emails.send({
          from: "Split Sheet <splitsheet@artistshield.com>",
          to: [recipient.email],
          subject: `Split Sheet for Review: "${songInfo.title}"`,
          html,
        });
        
        console.log(`Email sent to ${recipient.email}:`, emailResponse);
        return { email: recipient.email, ...emailResponse };
      })
    );

    return new Response(
      JSON.stringify({ success: true, sent: results.length, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-splitsheet function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
