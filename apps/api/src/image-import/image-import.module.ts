import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiagramsModule } from '../diagrams/diagrams.module';
import { ImageImportController } from './image-import.controller';
import { ImageRecognitionService } from './image-recognition.service';

@Module({
  imports: [AuthModule, DiagramsModule],
  controllers: [ImageImportController],
  providers: [ImageRecognitionService],
})
export class ImageImportModule {}
