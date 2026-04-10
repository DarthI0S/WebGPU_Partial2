import { mat4, vec3 } from "./math";
import type { Vec3, Mat4 } from "./math";

export class Arcball{
    private currentRotation : Mat4 = mat4.identity();
    private is_dragging = false;
    private lastPos : Vec3 = [0, 0, 0];

    //convierte la posisicon en una esfera
    private convertPos_sphere(x: number, y: number, wei:number, hei:number): Vec3{
        const x_in = ((2*x)/wei) -1;
        const y_in = -((2*y)/hei) + 1; //y invertidas

        const len = x_in**2 + y_in**2; //formula esfera
        if(len<=1.0){
            return [x_in, y_in, Math.sqrt(1-len)];
        }else{
            return vec3.normalize([x_in, y_in, 0]);//min
        }
    }
    onMouseDown(x: number, y: number, wei: number, hei: number){//(x, y) y (width, height)
        this.is_dragging = true;
        this.lastPos = this.convertPos_sphere(x, y, wei, hei);
    }
    onMouseMoving(x: number, y: number, wei: number, hei: number){
        if(this.is_dragging==false) return;
        const current = this.convertPos_sphere(x, y, wei, hei);
        const axis = vec3.normalize(vec3.cross(this.lastPos,current));//direccion
        const dot   = Math.min(1, Math.max(-1, vec3.dot(this.lastPos, current)));
        const angle = Math.acos(dot); //arccos de dot, 
        if (angle > 0.0001){
            this.currentRotation = mat4.multiply(mat4.rotationAxis(axis, angle),this.currentRotation);
        }
        this.lastPos = current;
    }
    
    onMouseUp() {this.is_dragging = false;}
    getMatrix() : Mat4 {return this.currentRotation;}

};