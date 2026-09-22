import { Module } from '@nestjs/common';
import { DynamicAssistantController } from './dynamic-assistant.controller';
import { DynamicAssistantService } from './dynamic-assistant.service';

@Module({
  controllers: [DynamicAssistantController],
  providers: [DynamicAssistantService],
})
export class DynamicAssistantModule {}
