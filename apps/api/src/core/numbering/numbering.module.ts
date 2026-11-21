import { Global, Module } from '@nestjs/common';
import { DocumentNumberService } from './document-number.service';

/** Global: every business module can inject DocumentNumberService. */
@Global()
@Module({
  providers: [DocumentNumberService],
  exports: [DocumentNumberService],
})
export class NumberingModule {}
