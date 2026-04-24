import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Tool } from './interfaces/tool.interface';
import { CRM_TOOLS } from './tools';

@Injectable()
export class ToolRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly registry = new Map<string, Tool>();

  onModuleInit() {
    CRM_TOOLS.forEach((tool) => this.register(tool));
    this.logger.log(`Tool registry initialized with ${this.registry.size} tools`);
  }

  register(tool: Tool): void {
    if (this.registry.has(tool.name)) {
      this.logger.warn(`Tool "${tool.name}" is already registered — overwriting`);
    }
    this.registry.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.registry.get(name);
  }

  getAll(): Tool[] {
    return Array.from(this.registry.values());
  }
}
