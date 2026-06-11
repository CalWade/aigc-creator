import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface MailResult {
  messageId?: string;
  /** mock 模式下返回验证码供前端回填（开发便利） */
  demoCode?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly provider: "mock" | "resend";
  private readonly resendApiKey: string | null = null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const provider = this.config.get<string>("MAIL_PROVIDER", "mock");
    this.provider = provider as "mock" | "resend";
    this.fromAddress = this.config.get<string>("MAIL_FROM", "noreply@example.com");

    if (this.provider === "resend") {
      const key = this.config.get<string>("MAIL_API_KEY", "");
      if (!key) {
        this.logger.warn("MAIL_PROVIDER=resend but MAIL_API_KEY missing, falling back to mock");
        this.provider = "mock";
      } else {
        this.resendApiKey = key;
      }
    }

    this.logger.log(`Mail provider: ${this.provider}`);
  }

  async sendCode(to: string, code: string, minutes = 5): Promise<MailResult> {
    if (this.provider === "resend" && this.resendApiKey) {
      return this.sendViaResend(to, code, minutes);
    }
    return this.sendMock(to, code);
  }

  private async sendViaResend(to: string, code: string, minutes: number): Promise<MailResult> {
    const { Resend } = await import("resend");
    const resend = new Resend(this.resendApiKey!);

    const { data, error } = await resend.emails.send({
      from: this.fromAddress,
      to,
      subject: `您的验证码：${code}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="margin:0 0 16px;font-size:20px">验证码</h2>
          <p style="font-size:14px;color:#666">您正在进行身份验证，验证码为：</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:4px;margin:12px 0">${code}</p>
          <p style="font-size:13px;color:#999">${minutes} 分钟内有效，请勿泄露给他人。</p>
        </div>
      `,
    });

    if (error) {
      this.logger.error(`Resend send failed: ${error.message}`);
      throw new Error(`邮件发送失败: ${error.message}`);
    }

    this.logger.log(`Resend email sent to ${to}, id=${data?.id}`);
    return { messageId: data?.id };
  }

  private async sendMock(to: string, code: string): Promise<MailResult> {
    this.logger.log(`[mock] Email code=${code} sent to ${to}`);
    return { demoCode: code };
  }
}
