import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1, { message: 'El nombre del proyecto no puede estar vacío.' })
  @MaxLength(100)
  name!: string;
}
