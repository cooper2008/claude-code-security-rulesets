/**
 * Notification Service for Enterprise Distribution System
 * Handles alerts, notifications, and communication channels
 */

import { EventEmitter } from 'events';
import type { 
  NotificationConfig,
  NotificationChannel,
  NotificationEvent,
  NotificationTemplate,
  DeploymentProgress
} from './types';
import type { Alert } from './monitoring';

/**
 * Notification message
 */
export interface NotificationMessage {
  id: string;
  event: NotificationEvent;
  channel: string;
  recipients: string[];
  subject: string;
  content: string;
  template?: string;
  data: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  sentAt?: Date;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed';
  error?: string;
}

/**
 * Channel-specific configuration
 */
interface ChannelConfig {
  email?: {
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    from: string;
  };
  slack?: {
    webhookUrl: string;
    channels: Record<string, string>;
  };
  teams?: {
    webhookUrl: string;
  };
  webhook?: {
    url: string;
    headers: Record<string, string>;
    method: 'POST' | 'PUT';
  };
  sms?: {
    provider: 'twilio' | 'aws-sns';
    credentials: Record<string, string>;
  };
}

/**
 * Notification delivery service
 */
export class NotificationService extends EventEmitter {
  private config: NotificationConfig;
  private templates = new Map<string, NotificationTemplate>();
  private channels = new Map<string, NotificationChannel>();
  private messageQueue: NotificationMessage[] = [];
  private channelConfigs: ChannelConfig = {};
  private deliveryHistory = new Map<string, NotificationMessage>();

  constructor(config?: NotificationConfig) {
    super();
    this.config = config || {
      channels: [],
      events: [],
      templates: []
    };
    
    this.initializeChannels();
    this.initializeTemplates();
  }

  /**
   * Send notification for deployment event
   */
  async notify(
    event: NotificationEvent,
    data: Record<string, any>,
    options?: {
      priority?: 'low' | 'medium' | 'high' | 'critical';
      channels?: string[];
      template?: string;
    }
  ): Promise<NotificationMessage[]> {
    // Check if event notifications are enabled
    if (!this.config.events.includes(event)) {
      return [];
    }

    const priority = options?.priority || this.getEventPriority(event);
    const channels = options?.channels || this.getEnabledChannels();
    const template = options?.template || this.getDefaultTemplate(event);

    const messages: NotificationMessage[] = [];

    // Create notification message for each channel
    for (const channelType of channels) {
      const channel = this.channels.get(channelType);
      if (!channel || !channel.enabled) continue;

      const message = await this.createNotificationMessage(
        event,
        channelType,
        data,
        template,
        priority
      );

      messages.push(message);
      this.messageQueue.push(message);
      this.deliveryHistory.set(message.id, message);
    }

    // Process message queue
    await this.processMessageQueue();

    this.emit('notifications-sent', { event, messages, data });

    return messages;
  }

  /**
   * Send alert notification
   */
  async sendAlert(alert: Alert): Promise<NotificationMessage[]> {
    const data = {
      alertId: alert.id,
      alertName: alert.name,
      severity: alert.severity,
      message: alert.message,
      triggeredAt: alert.triggeredAt.toISOString(),
      status: alert.status,
      metadata: alert.metadata
    };

    const priority = alert.severity === 'critical' ? 'critical' :
                    alert.severity === 'warning' ? 'high' : 'medium';

    return this.notify('deployment-failed', data, { // Using deployment-failed as alert event
      priority,
      template: 'alert-notification'
    });
  }

  /**
   * Send deployment status update
   */
  async sendDeploymentUpdate(
    deploymentId: string,
    progress: DeploymentProgress,
    event: NotificationEvent = 'deployment-started'
  ): Promise<NotificationMessage[]> {
    const data = {
      deploymentId,
      status: progress.status,
      progress: progress.progress,
      totalTargets: progress.totalTargets,
      successfulTargets: progress.successfulTargets,
      failedTargets: progress.failedTargets,
      currentPhase: progress.currentPhase,
      startedAt: progress.startedAt.toISOString(),
      estimatedCompletionAt: progress.estimatedCompletionAt?.toISOString()
    };

    return this.notify(event, data);
  }

  /**
   * Configure notification channel
   */
  configureChannel(channelType: string, config: any): void {
    const channel: NotificationChannel = {
      type: channelType as any,
      config,
      enabled: true
    };

    this.channels.set(channelType, channel);
    
    // Store channel-specific configuration
    (this.channelConfigs as any)[channelType] = config;

    this.emit('channel-configured', { channelType, config });
  }

  /**
   * Register notification template
   */
  registerTemplate(template: NotificationTemplate): void {
    this.templates.set(template.name, template);
    this.emit('template-registered', { template });
  }

  /**
   * Get notification history
   */
  getNotificationHistory(
    filter?: {
      event?: NotificationEvent;
      channel?: string;
      priority?: string;
      since?: Date;
    }
  ): NotificationMessage[] {
    let messages = Array.from(this.deliveryHistory.values());

    if (filter) {
      if (filter.event) {
        messages = messages.filter(m => m.event === filter.event);
      }
      if (filter.channel) {
        messages = messages.filter(m => m.channel === filter.channel);
      }
      if (filter.priority) {
        messages = messages.filter(m => m.priority === filter.priority);
      }
      if (filter.since) {
        messages = messages.filter(m => m.timestamp >= filter.since!);
      }
    }

    return messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats(): {
    totalSent: number;
    delivered: number;
    failed: number;
    pending: number;
    successRate: number;
    channelStats: Record<string, {
      sent: number;
      delivered: number;
      failed: number;
    }>;
  } {
    const messages = Array.from(this.deliveryHistory.values());
    
    const totalSent = messages.length;
    const delivered = messages.filter(m => m.deliveryStatus === 'delivered').length;
    const failed = messages.filter(m => m.deliveryStatus === 'failed').length;
    const pending = messages.filter(m => m.deliveryStatus === 'pending').length;
    const successRate = totalSent > 0 ? (delivered / totalSent) * 100 : 0;

    // Calculate per-channel statistics
    const channelStats: Record<string, { sent: number; delivered: number; failed: number }> = {};
    
    messages.forEach(message => {
      if (!channelStats[message.channel]) {
        channelStats[message.channel] = { sent: 0, delivered: 0, failed: 0 };
      }
      
      channelStats[message.channel].sent++;
      if (message.deliveryStatus === 'delivered') {
        channelStats[message.channel].delivered++;
      } else if (message.deliveryStatus === 'failed') {
        channelStats[message.channel].failed++;
      }
    });

    return {
      totalSent,
      delivered,
      failed,
      pending,
      successRate,
      channelStats
    };
  }

  /**
   * Private helper methods
   */
  private initializeChannels(): void {
    this.config.channels.forEach(channel => {
      this.channels.set(channel.type, channel);
    });
  }

  private initializeTemplates(): void {
    this.config.templates.forEach(template => {
      this.templates.set(template.name, template);
    });

    // Register default templates
    this.registerDefaultTemplates();
  }

  private registerDefaultTemplates(): void {
    const defaultTemplates: NotificationTemplate[] = [
      {
        name: 'deployment-started',
        content: `🚀 **Deployment Started**

Deployment ID: {{deploymentId}}
Targets: {{totalTargets}}
Status: {{status}}
Started: {{startedAt}}

[View Progress]({{dashboardUrl}})`,
        variables: ['deploymentId', 'totalTargets', 'status', 'startedAt', 'dashboardUrl']
      },
      {
        name: 'deployment-completed',
        content: `✅ **Deployment Completed Successfully**

Deployment ID: {{deploymentId}}
Targets: {{successfulTargets}}/{{totalTargets}} successful
Success Rate: {{successRate}}%
Duration: {{duration}}

All security configurations have been deployed successfully.`,
        variables: ['deploymentId', 'successfulTargets', 'totalTargets', 'successRate', 'duration']
      },
      {
        name: 'deployment-failed',
        content: `❌ **Deployment Failed**

Deployment ID: {{deploymentId}}
Failed Targets: {{failedTargets}}/{{totalTargets}}
Failure Rate: {{failureRate}}%

**Action Required**: Review deployment logs and retry failed targets.

[View Details]({{dashboardUrl}})`,
        variables: ['deploymentId', 'failedTargets', 'totalTargets', 'failureRate', 'dashboardUrl']
      },
      {
        name: 'rollback-started',
        content: `🔄 **Rollback Started**

Deployment ID: {{deploymentId}}
Reason: {{reason}}
Targets: {{targetCount}}

Rollback operation is in progress...`,
        variables: ['deploymentId', 'reason', 'targetCount']
      },
      {
        name: 'rollback-completed',
        content: `✅ **Rollback Completed**

Deployment ID: {{deploymentId}}
Targets Restored: {{targetsRestored}}/{{totalTargets}}
Duration: {{duration}}

Previous configuration has been restored successfully.`,
        variables: ['deploymentId', 'targetsRestored', 'totalTargets', 'duration']
      },
      {
        name: 'alert-notification',
        content: `🚨 **Alert: {{alertName}}**

Severity: {{severity}}
Status: {{status}}
Time: {{triggeredAt}}

{{message}}

Alert ID: {{alertId}}`,
        variables: ['alertName', 'severity', 'status', 'triggeredAt', 'message', 'alertId']
      }
    ];

    defaultTemplates.forEach(template => this.registerTemplate(template));
  }

  private async createNotificationMessage(
    event: NotificationEvent,
    channelType: string,
    data: Record<string, any>,
    templateName: string,
    priority: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<NotificationMessage> {
    const template = this.templates.get(templateName);
    const content = template ? this.renderTemplate(template, data) : JSON.stringify(data);
    const subject = this.generateSubject(event, data);

    const message: NotificationMessage = {
      id: this.generateMessageId(),
      event,
      channel: channelType,
      recipients: this.getChannelRecipients(channelType),
      subject,
      content,
      template: templateName,
      data,
      priority,
      timestamp: new Date(),
      deliveryStatus: 'pending'
    };

    return message;
  }

  private async processMessageQueue(): Promise<void> {
    const pendingMessages = this.messageQueue.filter(m => m.deliveryStatus === 'pending');
    
    for (const message of pendingMessages) {
      try {
        await this.deliverMessage(message);
        message.deliveryStatus = 'sent';
        message.sentAt = new Date();
        
        this.emit('message-sent', { message });
      } catch (error) {
        message.deliveryStatus = 'failed';
        message.error = error instanceof Error ? error.message : String(error);
        
        this.emit('message-failed', { message, error });
      }
    }

    // Remove processed messages from queue
    this.messageQueue = this.messageQueue.filter(m => m.deliveryStatus === 'pending');
  }

  private async deliverMessage(message: NotificationMessage): Promise<void> {
    const channel = this.channels.get(message.channel);
    if (!channel) {
      throw new Error(`Channel ${message.channel} not configured`);
    }

    switch (channel.type) {
      case 'email':
        await this.sendEmail(message);
        break;
      case 'slack':
        await this.sendSlack(message);
        break;
      case 'teams':
        await this.sendTeams(message);
        break;
      case 'webhook':
        await this.sendWebhook(message);
        break;
      case 'sms':
        await this.sendSms(message);
        break;
      default:
        throw new Error(`Unsupported channel type: ${channel.type}`);
    }
  }

  private async sendEmail(message: NotificationMessage): Promise<void> {
    const config = this.channelConfigs.email;
    if (!config) {
      throw new Error('Email channel not configured');
    }

    // Mock email sending (in real implementation, use nodemailer or similar)
    console.log(`📧 Email sent to ${message.recipients.join(', ')}: ${message.subject}`);
    
    // Simulate async email sending
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendSlack(message: NotificationMessage): Promise<void> {
    const config = this.channelConfigs.slack;
    if (!config) {
      throw new Error('Slack channel not configured');
    }

    // Format message for Slack
    const slackMessage = {
      text: message.subject,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message.content
          }
        }
      ],
      attachments: [{
        color: this.getPriorityColor(message.priority),
        footer: 'Claude Code Enterprise',
        ts: Math.floor(message.timestamp.getTime() / 1000)
      }]
    };

    // Mock Slack webhook call
    console.log(`💬 Slack message sent: ${message.subject}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendTeams(message: NotificationMessage): Promise<void> {
    const config = this.channelConfigs.teams;
    if (!config) {
      throw new Error('Teams channel not configured');
    }

    // Mock Teams webhook call
    console.log(`👥 Teams message sent: ${message.subject}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendWebhook(message: NotificationMessage): Promise<void> {
    const config = this.channelConfigs.webhook;
    if (!config) {
      throw new Error('Webhook channel not configured');
    }

    // Mock webhook call
    console.log(`🔗 Webhook called: ${message.subject}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendSms(message: NotificationMessage): Promise<void> {
    const config = this.channelConfigs.sms;
    if (!config) {
      throw new Error('SMS channel not configured');
    }

    // Mock SMS sending
    console.log(`📱 SMS sent to ${message.recipients.join(', ')}: ${message.content.substring(0, 100)}...`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private renderTemplate(template: NotificationTemplate, data: Record<string, any>): string {
    let content = template.content;
    
    // Replace template variables
    template.variables.forEach(variable => {
      const value = data[variable] || `{{${variable}}}`;
      content = content.replace(new RegExp(`{{${variable}}}`, 'g'), String(value));
    });

    return content;
  }

  private generateSubject(event: NotificationEvent, data: Record<string, any>): string {
    const subjects: Record<NotificationEvent, string> = {
      'deployment-started': `🚀 Deployment Started - ${data.deploymentId}`,
      'deployment-completed': `✅ Deployment Completed - ${data.deploymentId}`,
      'deployment-failed': `❌ Deployment Failed - ${data.deploymentId}`,
      'deployment-cancelled': `⏹️ Deployment Cancelled - ${data.deploymentId}`,
      'rollback-started': `🔄 Rollback Started - ${data.deploymentId}`,
      'rollback-completed': `✅ Rollback Completed - ${data.deploymentId}`,
      'health-check-failed': `⚠️ Health Check Failed - ${data.targetName || 'Unknown Target'}`
    };

    return subjects[event] || `📢 Notification - ${event}`;
  }

  private getEventPriority(event: NotificationEvent): 'low' | 'medium' | 'high' | 'critical' {
    const priorities: Record<NotificationEvent, 'low' | 'medium' | 'high' | 'critical'> = {
      'deployment-started': 'medium',
      'deployment-completed': 'medium',
      'deployment-failed': 'high',
      'deployment-cancelled': 'medium',
      'rollback-started': 'high',
      'rollback-completed': 'medium',
      'health-check-failed': 'high'
    };

    return priorities[event] || 'medium';
  }

  private getPriorityColor(priority: string): string {
    const colors = {
      low: 'good',
      medium: '#2196F3',
      high: 'warning',
      critical: 'danger'
    };

    return colors[priority as keyof typeof colors] || '#2196F3';
  }

  private getEnabledChannels(): string[] {
    const enabled: string[] = [];
    this.channels.forEach((channel, type) => {
      if (channel.enabled) {
        enabled.push(type);
      }
    });
    return enabled;
  }

  private getDefaultTemplate(event: NotificationEvent): string {
    return event; // Template name matches event name by default
  }

  private getChannelRecipients(channelType: string): string[] {
    // Mock recipients - in real implementation, this would be configured
    const recipients: Record<string, string[]> = {
      email: ['admin@company.com', 'devops@company.com'],
      slack: ['#deployments', '#alerts'],
      teams: ['Deployment Team'],
      webhook: ['webhook-endpoint'],
      sms: ['+1234567890']
    };

    return recipients[channelType] || [];
  }

  private generateMessageId(): string {
    const crypto = require('crypto');
    return crypto.randomUUID();
  }
}