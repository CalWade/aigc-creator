import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface SmsResult {
  messageId?: string;
  /** mock 模式下返回验证码供前端回填 */
  demoCode?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: "mock" | "volcengine";
  private readonly volcConfig: {
    accessKeyId: string;
    secretKey: string;
    smsAccount: string;
    signName: string;
    templateId: string;
    region: string;
  } | null = null;

  constructor(private readonly config: ConfigService) {
    const provider = this.config.get<string>("SMS_PROVIDER", "mock");
    this.provider = provider as "mock" | "volcengine";

    if (this.provider === "volcengine") {
      const ak = this.config.get<string>("SMS_ACCESS_KEY", "");
      const sk = this.config.get<string>("SMS_SECRET_KEY", "");
      const account = this.config.get<string>("SMS_ACCOUNT", "");
      const sign = this.config.get<string>("SMS_SIGN_NAME", "");
      const tid = this.config.get<string>("SMS_TEMPLATE_CODE", "");
      const region = this.config.get<string>("SMS_REGION", "cn-north-1");

      if (!ak || !sk || !account || !sign || !tid) {
        this.logger.warn(
          "SMS_PROVIDER=volcengine but required env vars missing, falling back to mock",
        );
        this.provider = "mock";
      } else {
        this.volcConfig = {
          accessKeyId: ak,
          secretKey: sk,
          smsAccount: account,
          signName: sign,
          templateId: tid,
          region,
        };
      }
    }

    this.logger.log(`SMS provider: ${this.provider}`);
  }

  async sendCode(phone: string, code: string): Promise<SmsResult> {
    if (this.provider === "volcengine" && this.volcConfig) {
      return this.sendViaVolcengine(phone, code);
    }
    return this.sendMock(phone, code);
  }

  private async sendViaVolcengine(phone: string, code: string): Promise<SmsResult> {
    const volcengine = await import("@volcengine/openapi");
    const cfg = this.volcConfig!;

    const smsService = new volcengine.sms.SmsService({
      accessKeyId: cfg.accessKeyId,
      secretKey: cfg.secretKey,
      region: cfg.region,
      host: "sms.volcengineapi.com",
      serviceName: "volcSMS",
    });

    const resp = await smsService.Send({
      SmsAccount: cfg.smsAccount,
      Sign: cfg.signName,
      TemplateID: cfg.templateId,
      TemplateParam: JSON.stringify({ code }),
      PhoneNumbers: phone,
      Tag: "",
      UserExtCode: "",
    });

    const result = resp as {
      ResponseMetadata?: { RequestId?: string };
      Result?: { MessageID?: string[] };
    };
    this.logger.log(
      `volcengine SMS sent to ${phone.slice(-4)}****, requestId=${result.ResponseMetadata?.RequestId}`,
    );
    return { messageId: result.Result?.MessageID?.[0] };
  }

  private async sendMock(phone: string, code: string): Promise<SmsResult> {
    this.logger.log(`[mock] SMS code=${code} sent to ${phone.slice(-4)}****`);
    return { demoCode: code };
  }
}
