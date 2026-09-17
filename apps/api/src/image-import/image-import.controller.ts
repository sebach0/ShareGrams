import { BadRequestException, Controller, ForbiddenException, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { UMLModel } from '@sharegrams/uml-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { DiagramsService } from '../diagrams/diagrams.service';
import { ImageRecognitionService, isSupportedImageType } from './image-recognition.service';
import type { ImageRecognitionResult } from './image-recognition.types';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Solo lectura: reconoce la imagen y devuelve un batch de Command[] sin
 * persistir nada. El frontend los muestra como vista previa; recién se
 * aplican (y se persisten) cuando el usuario confirma, reusando el mismo
 * dispatch de comandos que el editor manual.
 */
@Controller('diagrams')
@UseGuards(JwtAuthGuard)
export class ImageImportController {
  constructor(
    private readonly diagramsService: DiagramsService,
    private readonly imageRecognitionService: ImageRecognitionService,
  ) {}

  @Post(':id/recognize-image')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } }))
  async recognizeImage(
    @Param('id') diagramId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ): Promise<ImageRecognitionResult> {
    if (!file) {
      throw new BadRequestException('Falta el archivo de imagen.');
    }

    const mimetype = file.mimetype;
    if (!isSupportedImageType(mimetype)) {
      throw new BadRequestException('Formato de imagen no soportado. Usá PNG, JPEG, GIF o WEBP.');
    }

    const { diagram, access } = await this.diagramsService.getByIdWithAccess(diagramId, user.sub);
    if (access === 'VIEWER') {
      throw new ForbiddenException('Tu rol en este proyecto es de solo lectura.');
    }

    const model = diagram.model as unknown as UMLModel;
    return this.imageRecognitionService.recognize(file.buffer, mimetype, model.classes.length);
  }
}
